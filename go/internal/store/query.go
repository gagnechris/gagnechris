package store

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/smithy-go"

	"github.com/gagnechris/gagnechris/go/internal/api"
	"github.com/gagnechris/gagnechris/go/internal/data"
)

// PageByteBudget keeps list pages well under Lambda's 6 MB response cap,
// which the proxy result's second JSON escaping eats into.
const PageByteBudget = 1_000_000

// JSONByteLength is JSON.stringify's UTF-8 length; Go's default HTML
// escaping would overcount.
func JSONByteLength(v any) int {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(v)
	return buf.Len() - 1
}

// Page is one page of rows and the cursor that resumes after it.
type Page[T any] struct {
	Items      []T
	NextCursor string
}

// PageQuery is one DynamoDB Query read as a page.
type PageQuery struct {
	Input      dynamodb.QueryInput
	Cursor     string
	Limit      int
	CursorKeys []string
	// PartitionAttr and PartitionValue reject cursors from another partition.
	PartitionAttr, PartitionValue string
	// ByteBudget caps the JSON bytes of returned rows; the first row is
	// always returned. Zero means no cap.
	ByteBudget int
	// MaxItems stops after this many kept rows so Limit can read further
	// than a page returns. Zero means no cap.
	MaxItems int
}

// RowMapper maps a row; a *api.DataIntegrityError skips it (logged), and
// skip drops it silently.
type RowMapper[T any] func(item data.Item) (row T, skip bool, err error)

// QueryPage reads one page with q, mapping each row.
func QueryPage[T any](ctx context.Context, t *data.Table, q PageQuery, mapRow RowMapper[T], onCorrupt func(*api.DataIntegrityError)) (Page[T], error) {
	start, err := DecodeCursor(q.Cursor, q.CursorKeys)
	if err != nil {
		return Page[T]{}, err
	}
	if q.PartitionAttr != "" {
		if err := AssertCursorPartition(start, q.PartitionAttr, q.PartitionValue); err != nil {
			return Page[T]{}, err
		}
	}
	in := q.Input
	in.TableName = aws.String(t.Name)
	in.ExclusiveStartKey = start
	if q.Limit > 0 {
		in.Limit = aws.Int32(int32(q.Limit))
	}
	res, err := t.DB.Query(ctx, &in)
	if err != nil {
		if isStartKeyValidation(err) {
			return Page[T]{}, api.ErrInvalidCursor
		}
		return Page[T]{}, err
	}
	var page Page[T]
	used := 0
	for i, item := range res.Items {
		row, skip, err := mapRow(item)
		var corrupt *api.DataIntegrityError
		if errors.As(err, &corrupt) {
			onCorrupt(corrupt)
			continue
		}
		if err != nil {
			return Page[T]{}, err
		}
		if skip {
			continue
		}
		if q.ByteBudget > 0 {
			size := JSONByteLength(row)
			if len(page.Items) > 0 && used+size > q.ByteBudget {
				page.NextCursor = EncodeCursor(keyOf(res.Items[i-1], q.CursorKeys))
				return page, nil
			}
			used += size
		}
		page.Items = append(page.Items, row)
		if q.MaxItems > 0 && len(page.Items) >= q.MaxItems && i < len(res.Items)-1 {
			page.NextCursor = EncodeCursor(keyOf(item, q.CursorKeys))
			return page, nil
		}
	}
	page.NextCursor = EncodeCursor(res.LastEvaluatedKey)
	return page, nil
}

func isStartKeyValidation(err error) bool {
	var apiErr smithy.APIError
	if !errors.As(err, &apiErr) || apiErr.ErrorCode() != "ValidationException" {
		return false
	}
	m := strings.ToLower(apiErr.ErrorMessage())
	return strings.Contains(m, "starting key") || strings.Contains(m, "exclusive start key")
}

const compositePrefix = "mp."

type compositeCursor struct {
	P int    `json:"p"`
	K string `json:"k,omitempty"`
}

func decodeComposite(cursor string, partitions int) (compositeCursor, error) {
	if cursor == "" {
		return compositeCursor{}, nil
	}
	rest, ok := strings.CutPrefix(cursor, compositePrefix)
	if !ok {
		return compositeCursor{}, api.ErrInvalidCursor
	}
	raw, err := decodeBase64URL(rest)
	if err != nil {
		return compositeCursor{}, api.ErrInvalidCursor
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal(raw, &fields) != nil || fields == nil {
		return compositeCursor{}, api.ErrInvalidCursor
	}
	var c compositeCursor
	var p float64
	if json.Unmarshal(fields["p"], &p) != nil || p != float64(int(p)) || p < 0 || int(p) >= partitions {
		return compositeCursor{}, api.ErrInvalidCursor
	}
	c.P = int(p)
	if k, ok := fields["k"]; ok {
		if json.Unmarshal(k, &c.K) != nil || c.K == "" {
			return compositeCursor{}, api.ErrInvalidCursor
		}
	}
	return c, nil
}

func encodeComposite(c compositeCursor) string {
	b, _ := json.Marshal(c)
	return compositePrefix + base64.RawURLEncoding.EncodeToString(b)
}

// PartitionFetch reads a page of one partition with up to remaining rows
// and remainingBytes JSON bytes.
type PartitionFetch[P, T any] func(partition P, cursor string, remaining, remainingBytes int) (Page[T], error)

// WalkPartitions pages through partitions in order: results are grouped by
// partition, not globally sorted. A fetch may return fewer rows than asked
// as long as its cursor advances.
func WalkPartitions[P, T any](partitions []P, cursor string, limit int, fetch PartitionFetch[P, T]) (Page[T], error) {
	c, err := decodeComposite(cursor, len(partitions))
	if err != nil {
		return Page[T]{}, err
	}
	var out Page[T]
	used := 0
	full := func() bool { return len(out.Items) >= limit || used >= PageByteBudget }
	p, k := c.P, c.K
	for p < len(partitions) {
		page, err := fetch(partitions[p], k, limit-len(out.Items), PageByteBudget-used)
		if err != nil {
			return Page[T]{}, err
		}
		for _, item := range page.Items {
			used += JSONByteLength(item)
		}
		out.Items = append(out.Items, page.Items...)
		if page.NextCursor != "" {
			k = page.NextCursor
			if full() {
				out.NextCursor = encodeComposite(compositeCursor{P: p, K: k})
				return out, nil
			}
			continue
		}
		p++
		k = ""
		if full() {
			if p < len(partitions) {
				out.NextCursor = encodeComposite(compositeCursor{P: p})
			}
			return out, nil
		}
	}
	return out, nil
}

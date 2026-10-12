package store

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"slices"
	"sort"
	"strings"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/smithy-go"

	"github.com/gagnechris/gagnechris/services/api/internal/api"
	"github.com/gagnechris/gagnechris/services/api/internal/data"
	"github.com/gagnechris/gagnechris/services/api/internal/data/datatest"
)

type row struct {
	ID   string `json:"id"`
	Body string `json:"body"`
}

func str(item data.Item, attr string) string {
	s, _ := item[attr].(*types.AttributeValueMemberS)
	if s == nil {
		return ""
	}
	return s.Value
}

// memTable answers Query on pk = :pk in sk order, as DynamoDB pages a
// partition: Limit rows after ExclusiveStartKey, and LastEvaluatedKey while
// rows remain.
func memTable(partitions map[string][]data.Item) (*data.Table, *[]*dynamodb.QueryInput) {
	for _, rows := range partitions {
		sort.Slice(rows, func(i, j int) bool { return str(rows[i], "sk") < str(rows[j], "sk") })
	}
	var queries []*dynamodb.QueryInput
	f := &datatest.Fake{QueryFn: func(in *dynamodb.QueryInput) (*dynamodb.QueryOutput, error) {
		queries = append(queries, in)
		rows := partitions[str(in.ExpressionAttributeValues, ":pk")]
		start := 0
		if after := str(in.ExclusiveStartKey, "sk"); after != "" {
			for start < len(rows) && str(rows[start], "sk") <= after {
				start++
			}
		}
		end := len(rows)
		if in.Limit != nil {
			end = min(start+int(*in.Limit), end)
		}
		out := &dynamodb.QueryOutput{Items: rows[start:end]}
		if end < len(rows) {
			out.LastEvaluatedKey = keyOf(rows[end-1], PrimaryCursorKeys)
		}
		return out, nil
	}}
	return &data.Table{DB: f, Name: "test"}, &queries
}

func rowsOf(pk string, n, bodyLen int) []data.Item {
	out := make([]data.Item, n)
	for i := range out {
		out[i] = data.Item{"pk": data.S(pk), "sk": data.S(fmt.Sprintf("S#%03d", i)), "body": data.S(strings.Repeat("x", bodyLen))}
	}
	return out
}

func mapRow(item data.Item) (row, bool, error) {
	return row{ID: str(item, "pk") + "/" + str(item, "sk"), Body: str(item, "body")}, false, nil
}

func noCorrupt(t *testing.T) func(*api.DataIntegrityError) {
	return func(e *api.DataIntegrityError) { t.Fatalf("unexpected corrupt row: %v", e) }
}

func partitionQuery(pk, cursor string, limit int) PageQuery {
	return PageQuery{
		Input: dynamodb.QueryInput{
			KeyConditionExpression:    aws.String("pk = :pk"),
			ExpressionAttributeValues: map[string]types.AttributeValue{":pk": data.S(pk)},
		},
		Cursor: cursor, Limit: limit, CursorKeys: PrimaryCursorKeys,
		PartitionAttr: "pk", PartitionValue: pk,
	}
}

func ids(rows []row) []string {
	out := make([]string, len(rows))
	for i, r := range rows {
		out[i] = r.ID
	}
	return out
}

func cursorSk(t *testing.T, cursor string) string {
	t.Helper()
	key, err := DecodeCursor(cursor, PrimaryCursorKeys)
	if err != nil {
		t.Fatalf("cursor %q: %v", cursor, err)
	}
	return str(key, "sk")
}

// A page cut by the byte budget resumes at the first row it left out.
func TestQueryPageByteBudgetCutResumesAfterTheLastRow(t *testing.T) {
	rows := rowsOf("P#1", 10, 100)
	table, queries := memTable(map[string][]data.Item{"P#1": rows})
	size := JSONByteLength(row{ID: "P#1/S#000", Body: strings.Repeat("x", 100)})

	var all []string
	cursor := ""
	for pages := 1; ; pages++ {
		q := partitionQuery("P#1", cursor, 10)
		q.ByteBudget = 3*size + size/2
		page, err := QueryPage(context.Background(), table, q, mapRow, noCorrupt(t))
		if err != nil {
			t.Fatal(err)
		}
		if len(page.Items) == 0 || len(page.Items) > 3 {
			t.Fatalf("page %d has %d rows, want 1 to 3", pages, len(page.Items))
		}
		all = append(all, ids(page.Items)...)
		if page.NextCursor == "" {
			break
		}
		last := page.Items[len(page.Items)-1].ID
		if sk := cursorSk(t, page.NextCursor); "P#1/"+sk != last {
			t.Fatalf("page %d cursor at %s, want the last returned row %s", pages, sk, last)
		}
		cursor = page.NextCursor
	}
	want := ids(func() []row {
		var out []row
		for _, item := range rows {
			r, _, _ := mapRow(item)
			out = append(out, r)
		}
		return out
	}())
	if !slices.Equal(all, want) {
		t.Fatalf("rows = %v, want each row once in order", all)
	}
	if len(*queries) != 4 || *(*queries)[0].TableName != "test" || *(*queries)[0].Limit != 10 || (*queries)[0].ExclusiveStartKey != nil {
		t.Fatalf("%d queries, first %+v; want 4 starting at the partition's head", len(*queries), (*queries)[0])
	}
}

// The first row always fits, so an oversized row can't stall paging.
func TestQueryPageReturnsAnOversizedFirstRow(t *testing.T) {
	table, _ := memTable(map[string][]data.Item{"P#1": rowsOf("P#1", 3, 500)})
	q := partitionQuery("P#1", "", 10)
	q.ByteBudget = 100
	page, err := QueryPage(context.Background(), table, q, mapRow, noCorrupt(t))
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 1 || cursorSk(t, page.NextCursor) != "S#000" {
		t.Fatalf("items = %v, cursor = %q; want the first row and a cursor after it", ids(page.Items), page.NextCursor)
	}
}

func TestQueryPageMaxItemsCut(t *testing.T) {
	everyOther := func(item data.Item) (row, bool, error) {
		r, _, _ := mapRow(item)
		var n int
		_, _ = fmt.Sscanf(str(item, "sk"), "S#%d", &n)
		return r, n%2 == 1, nil
	}

	table, _ := memTable(map[string][]data.Item{"P#1": rowsOf("P#1", 10, 1)})
	q := partitionQuery("P#1", "", 10)
	q.MaxItems = 3
	page, err := QueryPage(context.Background(), table, q, everyOther, noCorrupt(t))
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(ids(page.Items), []string{"P#1/S#000", "P#1/S#002", "P#1/S#004"}) || cursorSk(t, page.NextCursor) != "S#004" {
		t.Fatalf("items = %v, cursor = %q; want 3 kept rows and a cursor at the third", ids(page.Items), page.NextCursor)
	}
	q.Cursor = page.NextCursor
	page, err = QueryPage(context.Background(), table, q, everyOther, noCorrupt(t))
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(ids(page.Items), []string{"P#1/S#006", "P#1/S#008"}) || page.NextCursor != "" {
		t.Fatalf("items = %v, cursor = %q; want the rest and no cursor", ids(page.Items), page.NextCursor)
	}

	// Filling MaxItems on the query's last row is DynamoDB's cut, not ours: no
	// cursor pointing at an empty page.
	table, _ = memTable(map[string][]data.Item{"P#1": rowsOf("P#1", 3, 1)})
	q = partitionQuery("P#1", "", 3)
	q.MaxItems = 3
	page, err = QueryPage(context.Background(), table, q, mapRow, noCorrupt(t))
	if err != nil || len(page.Items) != 3 || page.NextCursor != "" {
		t.Fatalf("items = %v, cursor = %q, err = %v; want all 3 rows and no cursor", ids(page.Items), page.NextCursor, err)
	}
}

func TestQueryPageSkipsCorruptRows(t *testing.T) {
	table, _ := memTable(map[string][]data.Item{"P#1": rowsOf("P#1", 3, 1)})
	var corrupt []string
	mapper := func(item data.Item) (row, bool, error) {
		if str(item, "sk") == "S#001" {
			return row{}, false, &api.DataIntegrityError{Message: "bad", SK: "S#001"}
		}
		return mapRow(item)
	}
	page, err := QueryPage(context.Background(), table, partitionQuery("P#1", "", 10), mapper, func(e *api.DataIntegrityError) { corrupt = append(corrupt, e.SK) })
	if err != nil || len(page.Items) != 2 || !slices.Equal(corrupt, []string{"S#001"}) {
		t.Fatalf("items = %v, corrupt = %v, err = %v; want 2 rows and S#001 logged", ids(page.Items), corrupt, err)
	}

	boom := errors.New("boom")
	_, err = QueryPage(context.Background(), table, partitionQuery("P#1", "", 10), func(data.Item) (row, bool, error) { return row{}, false, boom }, noCorrupt(t))
	if !errors.Is(err, boom) {
		t.Fatalf("err = %v, want the mapper's error", err)
	}
}

func TestQueryPageRejectsForeignCursors(t *testing.T) {
	table, queries := memTable(map[string][]data.Item{"P#1": rowsOf("P#1", 3, 1)})
	otherPartition := EncodeCursor(data.Key("P#2", "S#000"))
	belowBound := EncodeCursor(data.Key("P#1", "A#000"))

	for name, q := range map[string]PageQuery{
		"another partition": partitionQuery("P#1", otherPartition, 10),
		"below the range": func() PageQuery {
			q := partitionQuery("P#1", belowBound, 10)
			q.SortAttr, q.SortLowerBound = "sk", "S#"
			return q
		}(),
		"wrong key set": partitionQuery("P#1", EncodeCursor(data.Item{"pk": data.S("P#1")}), 10),
		"not base64":    partitionQuery("P#1", "%%%", 10),
	} {
		if _, err := QueryPage(context.Background(), table, q, mapRow, noCorrupt(t)); !errors.Is(err, api.ErrInvalidCursor) {
			t.Errorf("%s: err = %v, want ErrInvalidCursor", name, err)
		}
	}
	if len(*queries) != 0 {
		t.Fatalf("%d queries, want none for a rejected cursor", len(*queries))
	}
}

func TestQueryPageMapsStartKeyValidation(t *testing.T) {
	cases := []struct {
		err  error
		want error
	}{
		{&smithy.GenericAPIError{Code: "ValidationException", Message: "The provided starting key is invalid"}, api.ErrInvalidCursor},
		{&smithy.GenericAPIError{Code: "ValidationException", Message: "Exclusive Start Key must have same size as table's key schema"}, api.ErrInvalidCursor},
	}
	other := &smithy.GenericAPIError{Code: "ValidationException", Message: "Query condition missed key schema element"}
	cases = append(cases, struct{ err, want error }{other, other})
	for _, c := range cases {
		table := &data.Table{Name: "test", DB: &datatest.Fake{QueryFn: func(*dynamodb.QueryInput) (*dynamodb.QueryOutput, error) { return nil, c.err }}}
		if _, err := QueryPage(context.Background(), table, partitionQuery("P#1", "", 10), mapRow, noCorrupt(t)); !errors.Is(err, c.want) {
			t.Errorf("%v: err = %v, want %v", c.err, err, c.want)
		}
	}
}

func walkFetch(t *testing.T, table *data.Table) PartitionFetch[string, row] {
	return func(pk, cursor string, remaining, remainingBytes int) (Page[row], error) {
		q := partitionQuery(pk, cursor, remaining)
		q.ByteBudget = remainingBytes
		return QueryPage(context.Background(), table, q, mapRow, noCorrupt(t))
	}
}

func walkAll(t *testing.T, partitions []string, limit int, fetch PartitionFetch[string, row]) (all []string, cursors []compositeCursor) {
	t.Helper()
	cursor := ""
	for requests := 0; ; requests++ {
		if requests > 100 {
			t.Fatal("walk never ended")
		}
		page, err := WalkPartitions(partitions, cursor, limit, fetch)
		if err != nil {
			t.Fatal(err)
		}
		all = append(all, ids(page.Items)...)
		if page.NextCursor == "" {
			return all, cursors
		}
		c, err := decodeComposite(page.NextCursor, len(partitions))
		if err != nil {
			t.Fatalf("cursor %q: %v", page.NextCursor, err)
		}
		cursors = append(cursors, c)
		cursor = page.NextCursor
	}
}

func TestWalkPartitionsCursorCuts(t *testing.T) {
	parts := map[string][]data.Item{"A": rowsOf("A", 2, 1), "B": nil, "C": rowsOf("C", 3, 1)}
	table, _ := memTable(parts)
	all, cursors := walkAll(t, []string{"A", "B", "C"}, 2, walkFetch(t, table))

	want := []string{"A/S#000", "A/S#001", "C/S#000", "C/S#001", "C/S#002"}
	if !slices.Equal(all, want) {
		t.Fatalf("rows = %v, want %v", all, want)
	}
	// A fills the first page as it runs out, so the cursor starts the next
	// partition; the second page stops mid-C and keeps C's own cursor.
	if len(cursors) != 2 || cursors[0] != (compositeCursor{P: 1}) || cursors[1].P != 2 || cursors[1].K == "" {
		t.Fatalf("cursors = %+v, want {P:1} then {P:2, K:...}", cursors)
	}
	if sk := cursorSk(t, cursors[1].K); sk != "S#001" {
		t.Fatalf("mid-partition cursor at %s, want S#001", sk)
	}
}

func TestWalkPartitionsPassesWhatIsLeft(t *testing.T) {
	type ask struct{ remaining, remainingBytes int }
	var asks []ask
	fetch := func(_ int, _ string, remaining, remainingBytes int) (Page[string], error) {
		asks = append(asks, ask{remaining, remainingBytes})
		return Page[string]{Items: []string{"ab"}}, nil
	}
	page, err := WalkPartitions([]int{0, 1, 2}, "", 10, fetch)
	if err != nil || len(page.Items) != 3 || page.NextCursor != "" {
		t.Fatalf("page = %+v, err = %v; want 3 items and no cursor", page, err)
	}
	item := JSONByteLength("ab")
	want := []ask{{10, PageByteBudget}, {9, PageByteBudget - item}, {8, PageByteBudget - 2*item}}
	if !slices.Equal(asks, want) {
		t.Fatalf("asks = %v, want %v", asks, want)
	}
}

func TestWalkPartitionsByteBudget(t *testing.T) {
	const body = 300_000
	table, _ := memTable(map[string][]data.Item{"A": rowsOf("A", 5, body), "B": rowsOf("B", 2, body)})
	fetch := walkFetch(t, table)
	page, err := WalkPartitions([]string{"A", "B"}, "", 100, fetch)
	if err != nil {
		t.Fatal(err)
	}
	used := 0
	for _, r := range page.Items {
		used += JSONByteLength(r)
	}
	if page.NextCursor == "" || used < PageByteBudget || used > PageByteBudget+body+100 {
		t.Fatalf("%d rows, %d bytes, cursor %q; want the page cut just past the budget", len(page.Items), used, page.NextCursor)
	}
	all, _ := walkAll(t, []string{"A", "B"}, 100, fetch)
	if len(all) != 7 || all[0] != "A/S#000" || all[6] != "B/S#001" {
		t.Fatalf("rows = %v, want all 7 once", all)
	}
}

func TestWalkPartitionsRejectsBadCursors(t *testing.T) {
	enc := func(raw string) string { return compositePrefix + base64.RawURLEncoding.EncodeToString([]byte(raw)) }
	fetch := func(int, string, int, int) (Page[string], error) {
		t.Fatal("fetched with a bad cursor")
		return Page[string]{}, nil
	}
	for name, cursor := range map[string]string{
		"no prefix":         base64.RawURLEncoding.EncodeToString([]byte(`{"p":0}`)),
		"not base64":        compositePrefix + "%%%",
		"not an object":     enc(`[]`),
		"partition missing": enc(`{"k":"x"}`),
		"partition too big": enc(`{"p":2}`),
		"negative":          enc(`{"p":-1}`),
		"fractional":        enc(`{"p":0.5}`),
		"empty key":         enc(`{"p":0,"k":""}`),
		"key not a string":  enc(`{"p":0,"k":1}`),
	} {
		if _, err := WalkPartitions([]int{0, 1}, cursor, 1, fetch); !errors.Is(err, api.ErrInvalidCursor) {
			t.Errorf("%s: err = %v, want ErrInvalidCursor", name, err)
		}
	}
}

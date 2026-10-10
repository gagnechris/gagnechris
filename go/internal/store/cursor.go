// Package store is the API's shared DynamoDB patterns: opaque cursors,
// paged queries, version-checked writes and the draft + PUBLISHED pair
// behind every site-admin entity, as services/api/src/data has them.
package store

import (
	"encoding/base64"
	"encoding/json"
	"strings"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"github.com/gagnechris/gagnechris/go/internal/api"
	"github.com/gagnechris/gagnechris/go/internal/data"
)

var (
	PrimaryCursorKeys = []string{"pk", "sk"}
	GSI1CursorKeys    = []string{"pk", "sk", "gsi1pk", "gsi1sk"}
)

// EncodeCursor is a key as base64url JSON; every key attribute in this
// table is a string.
func EncodeCursor(key data.Item) string {
	if len(key) == 0 {
		return ""
	}
	plain := make(map[string]string, len(key))
	for k, v := range key {
		if s, ok := v.(*types.AttributeValueMemberS); ok {
			plain[k] = s.Value
		}
	}
	b, _ := json.Marshal(plain)
	return base64.RawURLEncoding.EncodeToString(b)
}

// DecodeCursor rejects a cursor whose key set isn't exactly required.
func DecodeCursor(cursor string, required []string) (data.Item, error) {
	if strings.TrimSpace(cursor) == "" {
		return nil, nil
	}
	raw, err := decodeBase64URL(cursor)
	if err != nil {
		return nil, api.ErrInvalidCursor
	}
	var fields map[string]any
	if json.Unmarshal(raw, &fields) != nil || fields == nil {
		return nil, api.ErrInvalidCursor
	}
	if len(required) > 0 && len(fields) != len(required) {
		return nil, api.ErrInvalidCursor
	}
	key := data.Item{}
	for name, v := range fields {
		s, ok := v.(string)
		if !ok {
			if len(required) > 0 {
				return nil, api.ErrInvalidCursor
			}
			continue
		}
		key[name] = data.S(s)
	}
	for _, name := range required {
		if _, ok := key[name]; !ok {
			return nil, api.ErrInvalidCursor
		}
	}
	return key, nil
}

// decodeBase64URL is lenient like Buffer.from(s, 'base64url'): padding is
// optional.
func decodeBase64URL(s string) ([]byte, error) {
	return base64.RawURLEncoding.DecodeString(strings.TrimRight(s, "="))
}

// AssertCursorPartition rejects a cursor from another partition.
func AssertCursorPartition(key data.Item, attr, value string) error {
	if key == nil {
		return nil
	}
	if s, ok := key[attr].(*types.AttributeValueMemberS); !ok || s.Value != value {
		return api.ErrInvalidCursor
	}
	return nil
}

func keyOf(item data.Item, names []string) data.Item {
	out := data.Item{}
	for _, n := range names {
		if v, ok := item[n]; ok {
			out[n] = v
		}
	}
	return out
}

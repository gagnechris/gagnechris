package users

import (
	"context"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"github.com/gagnechris/gagnechris/go/internal/data"
	"github.com/gagnechris/gagnechris/go/internal/keys"
	"github.com/gagnechris/gagnechris/go/internal/store"
)

type removedUser struct {
	UserID        string
	Email         string
	PreviousLevel *string
}

// removedStore keeps removal out of Cognito: the Cognito user stays
// (disabled, no groups) so their sub, and with it their Notebook, survives a
// restore.
type removedStore interface {
	list(ctx context.Context) ([]removedUser, error)
	get(ctx context.Context, userID string) (*removedUser, error)
	put(ctx context.Context, r removedUser, removedBy string) error
	delete(ctx context.Context, userID string) error
}

type removedRepo struct {
	table *data.Table
	now   func() time.Time
}

func parseRemoved(item data.Item) (removedUser, error) {
	r := store.ReadItem(item)
	r.Str("pk", 1)
	r.Str("sk", 1)
	r.Literal("entityType", "removedUser")
	u := removedUser{
		UserID:        r.Str("userId", 1),
		Email:         r.Str("email", 0),
		PreviousLevel: r.NullEnum("previousLevel", accessLevels...),
	}
	r.Str("createdAt", 1)
	r.Str("removedBy", 1)
	return u, r.Err("removed user")
}

func (s removedRepo) list(ctx context.Context) ([]removedUser, error) {
	var out []removedUser
	pages := dynamodb.NewQueryPaginator(s.table.DB, &dynamodb.QueryInput{
		TableName:                 &s.table.Name,
		KeyConditionExpression:    aws.String("pk = :pk"),
		ExpressionAttributeValues: map[string]types.AttributeValue{":pk": data.S(keys.RemovedUsersPk())},
	})
	for pages.HasMorePages() {
		page, err := pages.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		for _, item := range page.Items {
			u, err := parseRemoved(item)
			if err != nil {
				return nil, err
			}
			out = append(out, u)
		}
	}
	return out, nil
}

func removedKey(userID string) data.Item {
	return data.Key(keys.RemovedUsersPk(), keys.RemovedUserSk(userID))
}

func (s removedRepo) get(ctx context.Context, userID string) (*removedUser, error) {
	res, err := s.table.DB.GetItem(ctx, &dynamodb.GetItemInput{
		TableName:      &s.table.Name,
		Key:            removedKey(userID),
		ConsistentRead: aws.Bool(true),
	})
	if err != nil || res.Item == nil {
		return nil, err
	}
	u, err := parseRemoved(res.Item)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (s removedRepo) put(ctx context.Context, r removedUser, removedBy string) error {
	item := removedKey(r.UserID)
	item["entityType"] = data.S("removedUser")
	item["userId"] = data.S(r.UserID)
	item["email"] = data.S(r.Email)
	item["previousLevel"] = data.OptS(r.PreviousLevel)
	item["createdAt"] = data.S(store.ISOTime(s.now()))
	item["removedBy"] = data.S(removedBy)
	_, err := s.table.DB.PutItem(ctx, &dynamodb.PutItemInput{TableName: &s.table.Name, Item: item})
	return err
}

func (s removedRepo) delete(ctx context.Context, userID string) error {
	_, err := s.table.DB.DeleteItem(ctx, &dynamodb.DeleteItemInput{TableName: &s.table.Name, Key: removedKey(userID)})
	return err
}

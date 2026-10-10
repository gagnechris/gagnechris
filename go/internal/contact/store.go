package contact

import (
	"context"
	"errors"
	"strconv"
	"time"
	"unicode/utf16"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/oklog/ulid/v2"

	"github.com/gagnechris/gagnechris/go/internal/contract"
	"github.com/gagnechris/gagnechris/go/internal/data"
	"github.com/gagnechris/gagnechris/go/internal/keys"
)

// store is the contact rows and rate counters in the data table, written as
// services/api/src/contact writes them.
type store struct {
	table *data.Table
	now   func() time.Time
}

// tryIncrement adds one to a counter row unless it is already at max.
func (s store) tryIncrement(ctx context.Context, pk, sk string, maxCount int, ttl int64) (bool, error) {
	_, err := s.table.DB.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName: aws.String(s.table.Name),
		Key: map[string]types.AttributeValue{
			"pk": &types.AttributeValueMemberS{Value: pk},
			"sk": &types.AttributeValueMemberS{Value: sk},
		},
		UpdateExpression:         aws.String("ADD #count :one SET #ttl = if_not_exists(#ttl, :ttl), entityType = if_not_exists(entityType, :etype)"),
		ConditionExpression:      aws.String("attribute_not_exists(#count) OR #count < :max"),
		ExpressionAttributeNames: map[string]string{"#count": "count", "#ttl": "ttl"},
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":one":   &types.AttributeValueMemberN{Value: "1"},
			":max":   number(int64(maxCount)),
			":ttl":   number(ttl),
			":etype": &types.AttributeValueMemberS{Value: "rateLimit"},
		},
	})
	var failed *types.ConditionalCheckFailedException
	if errors.As(err, &failed) {
		return false, nil
	}
	return err == nil, err
}

func number(n int64) types.AttributeValue {
	return &types.AttributeValueMemberN{Value: strconv.FormatInt(n, 10)}
}

const errContactIPLimit = "Too many contact submissions from this address. Try again later."

const errSESDailyLimit = "Daily email quota reached. Your message was saved; try again tomorrow."

func (s store) consumeContactIP(ctx context.Context, ip string) (bool, error) {
	at := s.now()
	return s.tryIncrement(ctx, keys.RateContactIPPk(ip), keys.RateHourSk(at),
		contract.Data.API.ContactPerIPPerHour, keys.TTLEndOfUTCHour(at))
}

// consumeSESSend is called only just before sending mail.
func (s store) consumeSESSend(ctx context.Context) (bool, error) {
	at := s.now()
	return s.tryIncrement(ctx, keys.RateSESGlobalPk(), keys.RateDaySk(at),
		contract.Data.API.SESGlobalDailyCap, keys.TTLEndOfUTCDay(at))
}

func (s store) claimResumeNotifyIP(ctx context.Context, ip string) (bool, error) {
	at := s.now()
	return s.tryIncrement(ctx, keys.RateResumeIPPk(ip), keys.RateDaySk(at), 1, keys.TTLEndOfUTCDay(at))
}

type messageItem struct {
	PK          string `dynamodbav:"pk"`
	SK          string `dynamodbav:"sk"`
	EntityType  string `dynamodbav:"entityType"`
	ContactID   string `dynamodbav:"contactId"`
	Name        string `dynamodbav:"name"`
	Email       string `dynamodbav:"email"`
	Message     string `dynamodbav:"message"`
	SourceIP    string `dynamodbav:"sourceIp"`
	CreatedAt   string `dynamodbav:"createdAt"`
	EmailStatus string `dynamodbav:"emailStatus"`
}

const isoMillis = "2006-01-02T15:04:05.000Z"

func (s store) save(ctx context.Context, name, email, message, sourceIP string) (string, error) {
	now := s.now()
	id := ulid.MustNew(ulid.Timestamp(now), ulid.DefaultEntropy()).String()
	item, err := attributevalue.MarshalMap(messageItem{
		PK:          keys.ContactPk(id),
		SK:          keys.ContactMsgSk(),
		EntityType:  "contact",
		ContactID:   id,
		Name:        name,
		Email:       email,
		Message:     message,
		SourceIP:    sourceIP,
		CreatedAt:   now.UTC().Format(isoMillis),
		EmailStatus: "pending",
	})
	if err != nil {
		return "", err
	}
	_, err = s.table.DB.PutItem(ctx, &dynamodb.PutItemInput{
		TableName:           aws.String(s.table.Name),
		Item:                item,
		ConditionExpression: aws.String("attribute_not_exists(pk)"),
	})
	return id, err
}

const maxEmailErrorUnits = 500

func (s store) updateEmailStatus(ctx context.Context, contactID, status, emailError string) error {
	in := &dynamodb.UpdateItemInput{
		TableName: aws.String(s.table.Name),
		Key: map[string]types.AttributeValue{
			"pk": &types.AttributeValueMemberS{Value: keys.ContactPk(contactID)},
			"sk": &types.AttributeValueMemberS{Value: keys.ContactMsgSk()},
		},
		UpdateExpression: aws.String("SET emailStatus = :status REMOVE emailError"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":status": &types.AttributeValueMemberS{Value: status},
		},
	}
	if emailError != "" {
		in.UpdateExpression = aws.String("SET emailStatus = :status, emailError = :err")
		in.ExpressionAttributeValues[":err"] = &types.AttributeValueMemberS{Value: truncateUnits(emailError, maxEmailErrorUnits)}
	}
	_, err := s.table.DB.UpdateItem(ctx, in)
	return err
}

// truncateUnits keeps at most n UTF-16 units, like String.slice, without
// splitting a surrogate pair.
func truncateUnits(s string, n int) string {
	units := 0
	for i, r := range s {
		units += len(utf16.Encode([]rune{r}))
		if units > n {
			return s[:i]
		}
	}
	return s
}

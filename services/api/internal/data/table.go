// Package data is the API's DynamoDB access: the single table packages/data
// describes, with keys from internal/keys.
package data

import (
	"context"
	"errors"
	"os"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
)

// maxAttempts matches DYNAMO_MAX_ATTEMPTS: the SDK owns throttle retries and
// callers only classify conflicts.
const maxAttempts = 3

// LoadAWS is the default credential chain and region;
// AWS_ENDPOINT_URL_DYNAMODB points DynamoDB at DynamoDB Local.
func LoadAWS(ctx context.Context) (aws.Config, error) {
	return config.LoadDefaultConfig(ctx, config.WithRetryMaxAttempts(maxAttempts))
}

// Client is the DynamoDB API the service calls. *dynamodb.Client is the
// production one; tests pass a fake, since conflicts, throttles and
// UnprocessedKeys don't happen on DynamoDB Local.
type Client interface {
	GetItem(ctx context.Context, in *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error)
	PutItem(ctx context.Context, in *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error)
	UpdateItem(ctx context.Context, in *dynamodb.UpdateItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.UpdateItemOutput, error)
	DeleteItem(ctx context.Context, in *dynamodb.DeleteItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.DeleteItemOutput, error)
	Query(ctx context.Context, in *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error)
	BatchGetItem(ctx context.Context, in *dynamodb.BatchGetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.BatchGetItemOutput, error)
	TransactWriteItems(ctx context.Context, in *dynamodb.TransactWriteItemsInput, optFns ...func(*dynamodb.Options)) (*dynamodb.TransactWriteItemsOutput, error)
}

var _ Client = (*dynamodb.Client)(nil)

type Table struct {
	DB   Client
	Name string
}

// TableFromEnv is the table DATA_TABLE_NAME names.
func TableFromEnv(cfg aws.Config) (*Table, error) {
	name := strings.TrimSpace(os.Getenv("DATA_TABLE_NAME"))
	if name == "" {
		return nil, errors.New("DATA_TABLE_NAME is not set")
	}
	// DynamoDB Local's CRC32 header doesn't match its bodies.
	local := os.Getenv("AWS_ENDPOINT_URL_DYNAMODB") != ""
	db := dynamodb.NewFromConfig(cfg, func(o *dynamodb.Options) {
		o.DisableValidateResponseChecksum = local
	})
	return &Table{DB: db, Name: name}, nil
}

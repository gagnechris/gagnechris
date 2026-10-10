// Package data is the API's DynamoDB access: the single table packages/data
// describes, with keys from internal/keys.
package data

import (
	"context"
	"errors"
	"os"
	"strings"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
)

// maxAttempts matches DYNAMO_MAX_ATTEMPTS: the SDK owns throttle retries and
// callers only classify conflicts.
const maxAttempts = 3

type Table struct {
	DB   *dynamodb.Client
	Name string
}

// FromEnv is the table DATA_TABLE_NAME names, reached with the default
// credential chain; AWS_ENDPOINT_URL_DYNAMODB points it at DynamoDB Local.
func FromEnv(ctx context.Context) (*Table, error) {
	name := strings.TrimSpace(os.Getenv("DATA_TABLE_NAME"))
	if name == "" {
		return nil, errors.New("DATA_TABLE_NAME is not set")
	}
	cfg, err := config.LoadDefaultConfig(ctx, config.WithRetryMaxAttempts(maxAttempts))
	if err != nil {
		return nil, err
	}
	return &Table{DB: dynamodb.NewFromConfig(cfg), Name: name}, nil
}

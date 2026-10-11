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

type Table struct {
	DB   *dynamodb.Client
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

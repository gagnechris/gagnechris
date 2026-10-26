module github.com/gagnechris/gagnechris/services/api

go 1.27.3

// The black-box HTTP suite is a TypeScript workspace; its node_modules can hold .go files.
ignore ./test

require (
	github.com/aws/aws-lambda-go v1.55.1
	github.com/aws/aws-sdk-go-v2 v1.47.4
	github.com/aws/aws-sdk-go-v2/config v1.33.10
	github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue v1.21.15
	github.com/aws/aws-sdk-go-v2/service/backup v1.69.3
	github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider v1.75.5
	github.com/aws/aws-sdk-go-v2/service/dynamodb v1.72.1
	github.com/aws/aws-sdk-go-v2/service/s3 v1.114.5
	github.com/aws/aws-sdk-go-v2/service/sesv2 v1.79.3
	github.com/aws/smithy-go v1.28.6
	github.com/google/uuid v1.6.0
	github.com/oapi-codegen/nullable v1.2.0
	github.com/oapi-codegen/runtime v1.8.0
	github.com/oklog/ulid/v2 v2.1.2
	github.com/santhosh-tekuri/jsonschema/v6 v6.0.3
	golang.org/x/text v0.43.0
)

require (
	github.com/apapsch/go-jsonmerge/v2 v2.0.0 // indirect
	github.com/aws/aws-sdk-go-v2/aws/protocol/eventstream v1.7.24 // indirect
	github.com/aws/aws-sdk-go-v2/credentials v1.20.10 // indirect
	github.com/aws/aws-sdk-go-v2/feature/ec2/imds v1.20.4 // indirect
	github.com/aws/aws-sdk-go-v2/internal/configsources v1.5.7 // indirect
	github.com/aws/aws-sdk-go-v2/internal/endpoints/v2 v2.8.7 // indirect
	github.com/aws/aws-sdk-go-v2/internal/v4a v1.5.7 // indirect
	github.com/aws/aws-sdk-go-v2/service/dynamodbstreams v1.46.2 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/accept-encoding v1.13.22 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/checksum v1.11.8 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/endpoint-discovery v1.13.7 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/presigned-url v1.14.7 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/s3shared v1.20.7 // indirect
	github.com/aws/aws-sdk-go-v2/service/signin v1.10.5 // indirect
	github.com/aws/aws-sdk-go-v2/service/sso v1.38.5 // indirect
	github.com/aws/aws-sdk-go-v2/service/ssooidc v1.43.5 // indirect
	github.com/aws/aws-sdk-go-v2/service/sts v1.51.5 // indirect
)

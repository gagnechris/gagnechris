// Command restore-test is the AWS Backup restore-test validator and daily
// leftover-table and backup-freshness check.
package main

import (
	"context"
	"log"

	"github.com/aws/aws-lambda-go/lambda"

	"github.com/gagnechris/gagnechris/go/internal/observability"
	"github.com/gagnechris/gagnechris/go/internal/restoretest"
)

func main() {
	deps, err := restoretest.DepsFromEnv(context.Background())
	if err != nil {
		log.Fatal(err)
	}
	h, err := restoretest.NewHandler(deps, observability.LoggerFromEnv(), observability.MetricsFromEnv())
	if err != nil {
		log.Fatal(err)
	}
	lambda.Start(h.Handle)
}

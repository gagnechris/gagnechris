// Command notebook-recap writes a weekly recap into its Notebook note. The
// API invokes it asynchronously, one job per invocation.
package main

import (
	"context"
	"log"
	"time"

	"github.com/aws/aws-lambda-go/lambda"

	"github.com/gagnechris/gagnechris/services/api/internal/claude"
	"github.com/gagnechris/gagnechris/services/api/internal/data"
	"github.com/gagnechris/gagnechris/services/api/internal/notebook"
	"github.com/gagnechris/gagnechris/services/api/internal/observability"
)

func main() {
	ctx := context.Background()
	cfg, err := data.LoadAWS(ctx)
	if err != nil {
		log.Fatal(err)
	}
	table, err := data.TableFromEnv(cfg)
	if err != nil {
		log.Fatal(err)
	}
	writer, err := claude.NewWriter(ctx, cfg.Region)
	if err != nil {
		log.Fatal(err)
	}
	recapper := notebook.NewRecapper(table, writer, time.Now)
	logger := observability.LoggerFromEnv()
	lambda.Start(func(ctx context.Context, job notebook.RecapJob) error {
		start := time.Now()
		err := recapper.Run(ctx, job)
		if err != nil {
			logger.Error("weekly recap failed", "noteId", job.NoteID, "error", err)
			return err
		}
		logger.Info("weekly recap written", "noteId", job.NoteID, "ms", time.Since(start).Milliseconds())
		return nil
	})
}

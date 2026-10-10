// Command api is the HTTP API: a Lambda behind API Gateway, or a plain HTTP
// server on PORT when it runs outside Lambda.
package main

import (
	"context"
	"log"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/service/sesv2"

	"github.com/gagnechris/gagnechris/go/internal/api"
	"github.com/gagnechris/gagnechris/go/internal/contact"
	"github.com/gagnechris/gagnechris/go/internal/contract"
	"github.com/gagnechris/gagnechris/go/internal/data"
	"github.com/gagnechris/gagnechris/go/internal/observability"
)

var processStart = time.Now()

func main() {
	inLambda := os.Getenv("AWS_LAMBDA_RUNTIME_API") != ""
	cfg, err := data.LoadAWS(context.Background())
	if err != nil {
		log.Fatal(err)
	}
	table, err := data.TableFromEnv(cfg)
	if err != nil {
		log.Fatal(err)
	}
	c := contract.Data.API
	logger := observability.NewLogger(os.Stdout, c.ServiceName)

	// Mail leaves only from Lambda; anywhere else it goes to the outbox.
	var mailer contact.Mailer = contact.SESMailer{Client: sesv2.NewFromConfig(cfg)}
	if !inLambda {
		contact.UseLocalAddresses()
		mailer = &contact.Outbox{File: os.Getenv("LOCAL_OUTBOX_FILE"), Log: logger}
	}

	routes := api.Routes(table)
	routes = append(routes, contact.Routes(contact.Deps{Table: table, Mail: mailer})...)
	app := api.NewApp(
		api.NewRouter(routes),
		logger,
		observability.NewMetrics(os.Stdout, c.MetricsNamespace, c.ServiceName),
		processStart,
	)
	if inLambda {
		lambda.Start(app.HandleLambda)
		return
	}
	log.Fatal(serveHTTP(app, logger))
}

// serveHTTP reads API_CLAIMS_MODE (test or local) and API_FALLBACK_URL, the
// server that answers routes Go doesn't serve yet.
func serveHTTP(app *api.App, logger *slog.Logger) error {
	table := os.Getenv("DATA_TABLE_NAME")
	if table == "gagnechris-prod" {
		log.Fatal("Refusing to serve gagnechris-prod over local HTTP")
	}
	mode := api.ClaimsMode(os.Getenv("API_CLAIMS_MODE"))
	switch mode {
	case api.ClaimsNone:
	case api.ClaimsTest:
		// Test claims are whatever the caller sends.
		if !strings.HasPrefix(table, "gagnechris-it-") {
			log.Fatal("The test API only serves gagnechris-it-* tables")
		}
	case api.ClaimsLocal:
		api.ApplyLocalAuthEnv()
	default:
		log.Fatalf("API_CLAIMS_MODE %q is not test or local", mode)
	}
	var fallback *url.URL
	if raw := os.Getenv("API_FALLBACK_URL"); raw != "" {
		u, err := url.Parse(raw)
		if err != nil {
			return err
		}
		fallback = u
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8787"
	}
	logger.Debug("serving", "port", port, "claims", string(mode))
	server := &http.Server{
		Addr:              "127.0.0.1:" + port,
		Handler:           app.HTTPHandler(mode, fallback),
		ReadHeaderTimeout: 10 * time.Second,
	}
	return server.ListenAndServe()
}

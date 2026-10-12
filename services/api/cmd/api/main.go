// Command api is the HTTP API: a Lambda behind API Gateway, or a plain HTTP
// server on PORT when it runs outside Lambda.
package main

import (
	"context"
	"log"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/sesv2"

	"github.com/gagnechris/gagnechris/services/api/internal/api"
	"github.com/gagnechris/gagnechris/services/api/internal/contact"
	"github.com/gagnechris/gagnechris/services/api/internal/contract"
	"github.com/gagnechris/gagnechris/services/api/internal/data"
	"github.com/gagnechris/gagnechris/services/api/internal/home"
	"github.com/gagnechris/gagnechris/services/api/internal/media"
	"github.com/gagnechris/gagnechris/services/api/internal/notebook"
	"github.com/gagnechris/gagnechris/services/api/internal/observability"
	"github.com/gagnechris/gagnechris/services/api/internal/posts"
	"github.com/gagnechris/gagnechris/services/api/internal/projects"
	"github.com/gagnechris/gagnechris/services/api/internal/resume"
	"github.com/gagnechris/gagnechris/services/api/internal/search"
	"github.com/gagnechris/gagnechris/services/api/internal/users"
)

var processStart = time.Now()

func main() {
	conf, err := loadConfig(os.Getenv)
	if err != nil {
		log.Fatal(err)
	}
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
	if !conf.inLambda {
		mailer = &contact.Outbox{File: conf.outboxFile, Log: logger}
	}

	app := api.NewApp(
		api.NewRouter(allRoutes(conf, table, mailer, cfg), conf.clients),
		logger,
		observability.NewMetrics(os.Stdout, c.MetricsNamespace, c.ServiceName),
		processStart,
	)
	if conf.inLambda {
		lambda.Start(app.HandleLambda)
		return
	}
	log.Fatal(serveHTTP(app, conf, logger))
}

func allRoutes(conf config, table *data.Table, mailer contact.Mailer, cfg aws.Config) []api.Route {
	userDeps := users.Deps{Table: table, AWS: cfg, UserPoolID: conf.userPoolID}
	if conf.memoryUsers {
		userDeps.Directory = users.LocalDirectory(time.Now)
	}
	routes := api.Routes(table)
	routes = append(routes, contact.Routes(contact.Deps{Table: table, Mail: mailer, Config: conf.contact})...)
	routes = append(routes, posts.Routes(table, nil)...)
	routes = append(routes, projects.Routes(table, nil)...)
	routes = append(routes, home.Routes(table, nil)...)
	routes = append(routes, resume.Routes(table, nil)...)
	routes = append(routes, search.Routes(table, nil)...)
	routes = append(routes, notebook.Routes(table, nil)...)
	routes = append(routes, users.Routes(userDeps)...)
	return append(routes, media.Routes(s3.NewPresignClient(s3.NewFromConfig(cfg)), conf.media, nil)...)
}

func serveHTTP(app *api.App, conf config, logger *slog.Logger) error {
	logger.Debug("serving", "port", conf.port, "claims", string(conf.claimsMode))
	server := &http.Server{
		Addr:              "127.0.0.1:" + conf.port,
		Handler:           app.HTTPHandler(conf.claimsMode),
		ReadHeaderTimeout: 10 * time.Second,
	}
	return server.ListenAndServe()
}

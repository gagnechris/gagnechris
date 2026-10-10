package api

import (
	"context"
	"encoding/base64"
	"strings"
	"sync/atomic"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambdacontext"
)

var lambdaColdStart atomic.Bool

func init() { lambdaColdStart.Store(true) }

// HandleLambda serves an API Gateway HTTP API (payload 2.0) event.
func (a *App) HandleLambda(ctx context.Context, event events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
	log := a.log
	if lc, ok := lambdacontext.FromContext(ctx); ok {
		// The keys Powertools Logger.addContext adds.
		log = log.With(
			"cold_start", lambdaColdStart.Swap(false),
			"function_arn", lc.InvokedFunctionArn,
			"function_memory_size", lambdacontext.MemoryLimitInMB,
			"function_name", lambdacontext.FunctionName,
			"function_request_id", lc.AwsRequestID,
		)
	}

	req := &Request{
		Method:    event.RequestContext.HTTP.Method,
		Query:     event.QueryStringParameters,
		Headers:   lowerKeys(event.Headers),
		RequestID: event.RequestContext.RequestID,
	}
	if req.Query == nil {
		req.Query = map[string]string{}
	}
	if req.RequestID == "" {
		req.RequestID = "unknown"
	}
	if jwt := event.RequestContext.Authorizer; jwt != nil && jwt.JWT != nil {
		req.Claims = jwt.JWT.Claims
	}
	if event.IsBase64Encoded {
		body, err := base64.StdEncoding.DecodeString(event.Body)
		if err != nil {
			return lambdaResponse(withAPIHeaders(mapError(ErrInvalidJSONBody, nil, nil), true)), nil
		}
		req.Body = body
	} else {
		req.Body = []byte(event.Body)
	}

	return lambdaResponse(a.Serve(ctx, req, event.RawPath, log)), nil
}

func lambdaResponse(r *Response) events.APIGatewayV2HTTPResponse {
	out := events.APIGatewayV2HTTPResponse{StatusCode: r.Status, Headers: r.Headers}
	if r.Gzipped {
		out.Body = base64.StdEncoding.EncodeToString(r.Body)
		out.IsBase64Encoded = true
	} else {
		out.Body = string(r.Body)
	}
	return out
}

func lowerKeys(in map[string]string) map[string]string {
	out := make(map[string]string, len(in))
	for k, v := range in {
		out[strings.ToLower(k)] = v
	}
	return out
}

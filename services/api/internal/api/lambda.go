package api

import (
	"context"
	"crypto/subtle"
	"encoding/base64"
	"net/netip"
	"strings"
	"sync/atomic"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambdacontext"

	"github.com/gagnechris/gagnechris/services/api/internal/contract"
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

	headers := lowerKeys(event.Headers)
	req := &Request{
		Method:    event.RequestContext.HTTP.Method,
		Query:     event.QueryStringParameters,
		Headers:   headers,
		RequestID: event.RequestContext.RequestID,
		SourceIP:  a.clientIP(headers, event.RequestContext.HTTP.SourceIP),
	}
	delete(headers, contract.Data.API.OriginVerifyHeader)
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

// clientIP is the viewer's address when the request carries the origin
// secret, which only CloudFront adds; API Gateway's sourceIp is then the
// CloudFront edge. Anything else, including a direct execute-api call, keeps
// sourceIp, so a caller can't choose the address its limits count against.
func (a *App) clientIP(headers map[string]string, sourceIP string) string {
	api := contract.Data.API
	got, ok := headers[api.OriginVerifyHeader]
	if a.originSecret == "" || !ok || subtle.ConstantTimeCompare([]byte(got), []byte(a.originSecret)) != 1 {
		return sourceIP
	}
	if ip, err := netip.ParseAddr(strings.TrimSpace(headers[api.ViewerAddressHeader])); err == nil {
		return ip.String()
	}
	return sourceIP
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

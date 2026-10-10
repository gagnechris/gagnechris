package api

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// ClaimsMode says where the HTTP server gets the claims API Gateway's JWT
// authorizer would pass. Either way they reach only protected routes.
type ClaimsMode string

const (
	// ClaimsNone passes no claims, so every protected route is a 401.
	ClaimsNone ClaimsMode = ""
	// ClaimsTest takes them as JSON in X-Test-Claims, for the HTTP suite.
	ClaimsTest ClaimsMode = "test"
	// ClaimsLocal builds them from a local Bearer token, for npm run
	// local:dev and the e2e stack.
	ClaimsLocal ClaimsMode = "local"
)

const testClaimsHeader = "X-Test-Claims"

// HTTPHandler serves the API over plain HTTP. With a fallback, requests no
// route owns go to that server instead, so the Go API can sit in front of
// the Node one while routes move over.
func (a *App) HTTPHandler(mode ClaimsMode, fallback *url.URL) http.Handler {
	var proxy *httputil.ReverseProxy
	if fallback != nil {
		proxy = &httputil.ReverseProxy{Rewrite: func(r *httputil.ProxyRequest) {
			r.SetURL(fallback)
			r.Out.Host = r.In.Host
		}}
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rawPath, _, _ := strings.Cut(r.RequestURI, "?")
		if proxy != nil && !a.router.Owns(r.Method, rawPath) {
			proxy.ServeHTTP(w, r)
			return
		}

		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		headers := map[string]string{}
		for k, v := range r.Header {
			if len(v) > 0 && k != testClaimsHeader {
				headers[strings.ToLower(k)] = v[0]
			}
		}
		query := map[string]string{}
		for k, v := range r.URL.Query() {
			query[k] = v[len(v)-1]
		}
		req := &Request{
			Method:    r.Method,
			Query:     query,
			Headers:   headers,
			Body:      body,
			RequestID: newRequestID(),
			SourceIP:  remoteHost(r.RemoteAddr),
		}
		if auth := a.router.AuthFor(r.Method, rawPath); auth != Public {
			req.Claims, err = requestClaims(mode, r, auth)
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
		}

		res := a.Serve(r.Context(), req, rawPath, nil)
		for k, v := range res.Headers {
			w.Header().Set(k, v)
		}
		w.WriteHeader(res.Status)
		_, _ = w.Write(res.Body)
	})
}

func requestClaims(mode ClaimsMode, r *http.Request, auth Auth) (map[string]string, error) {
	switch mode {
	case ClaimsTest:
		header := r.Header.Get(testClaimsHeader)
		if header == "" {
			return nil, nil
		}
		var raw map[string]any
		if err := json.Unmarshal([]byte(header), &raw); err != nil {
			return nil, fmt.Errorf("%s is not a JSON object: %w", testClaimsHeader, err)
		}
		return stringClaims(raw), nil
	case ClaimsLocal:
		return LocalClaims(r.Header.Get("Authorization"), auth, time.Now()), nil
	}
	return nil, nil
}

// stringClaims flattens claims the way the HTTP API authorizer does: arrays
// as JSON, everything else as its string form.
func stringClaims(raw map[string]any) map[string]string {
	out := make(map[string]string, len(raw))
	for k, v := range raw {
		switch v := v.(type) {
		case nil:
		case string:
			out[k] = v
		case []any:
			b, _ := json.Marshal(v)
			out[k] = string(b)
		case float64:
			out[k] = strconv.FormatFloat(v, 'f', -1, 64)
		default:
			out[k] = fmt.Sprint(v)
		}
	}
	return out
}

func remoteHost(addr string) string {
	if host, _, err := net.SplitHostPort(addr); err == nil {
		return host
	}
	return addr
}

func newRequestID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}

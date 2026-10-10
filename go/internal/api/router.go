package api

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/gagnechris/gagnechris/go/internal/observability"
)

// Request is what a route handler sees: the API Gateway HTTP API request,
// already matched and authorized.
type Request struct {
	Method string
	// Path is canonical: no /api prefix, no trailing slash.
	Path    string
	Query   map[string]string
	Headers map[string]string
	Body    []byte
	// Claims are the JWT authorizer's; nil on public routes.
	Claims    map[string]string
	RequestID string
	Params    map[string]string
	Log       *slog.Logger
	Metrics   *observability.Metrics
}

// UserID is the caller's Cognito sub.
func (r *Request) UserID() string { return r.Claims["sub"] }

// DecodeJSON reads the body into v; an empty body decodes as {}.
func (r *Request) DecodeJSON(v any) error {
	body := r.Body
	if len(body) == 0 {
		body = []byte("{}")
	}
	if json.Unmarshal(body, v) != nil {
		return ErrInvalidJSONBody
	}
	return nil
}

type Handler func(ctx context.Context, r *Request) (*Response, error)

type Route struct {
	Method  string
	Pattern string
	Auth    Auth
	// Metric names the per-route count; METHOD_pattern by default.
	Metric  string
	Handler Handler
}

func (r Route) metricName() string {
	if r.Metric != "" {
		return r.Metric
	}
	return r.Method + "_" + nonAlphanumeric.ReplaceAllString(r.Pattern, "_")
}

var nonAlphanumeric = regexp.MustCompile(`[^a-zA-Z0-9]+`)

type Router struct {
	routes []Route
}

// NewRouter panics on a route whose auth doesn't match the API Gateway
// prefix it lives under: a public route under /admin would get no claims,
// and a protected one elsewhere would trust whatever claims it is sent.
func NewRouter(routes []Route) *Router {
	for _, r := range routes {
		if want := RequiredAuth(r.Pattern); r.Auth != want {
			panic("api: " + r.Method + " " + r.Pattern + " must declare auth " + string(want))
		}
	}
	return &Router{routes: routes}
}

var errMalformedPath = BadRequest("Malformed path encoding", nil)

// decodeSegment matches decodeURIComponent, which also rejects escapes that
// aren't UTF-8.
func decodeSegment(segment string) (string, error) {
	s, err := url.PathUnescape(segment)
	if err != nil || !utf8.ValidString(s) {
		return "", errMalformedPath
	}
	return s, nil
}

func splitPath(p string) []string {
	return slices.DeleteFunc(strings.Split(p, "/"), func(s string) bool { return s == "" })
}

// matchPattern returns nil when path doesn't match. `:name` takes one
// segment and `:name+` the rest of the path.
func matchPattern(pattern, path string) (map[string]string, error) {
	patternParts, pathParts := splitPath(pattern), splitPath(path)
	params := map[string]string{}
	i, j := 0, 0
	for i < len(patternParts) && j < len(pathParts) {
		part := patternParts[i]
		if name, ok := strings.CutPrefix(part, ":"); ok {
			if rest, greedy := strings.CutSuffix(name, "+"); greedy {
				decoded := make([]string, 0, len(pathParts)-j)
				for _, seg := range pathParts[j:] {
					s, err := decodeSegment(seg)
					if err != nil {
						return nil, err
					}
					decoded = append(decoded, s)
				}
				params[rest] = strings.Join(decoded, "/")
				return params, nil
			}
			s, err := decodeSegment(pathParts[j])
			if err != nil {
				return nil, err
			}
			params[name] = s
		} else if part != pathParts[j] {
			return nil, nil
		}
		i++
		j++
	}
	if i == len(patternParts) && j == len(pathParts) {
		return params, nil
	}
	return nil, nil
}

func specificity(pattern string) int {
	n := 0
	for _, part := range splitPath(pattern) {
		if !strings.HasPrefix(part, ":") {
			n++
		}
	}
	return n
}

func normalizePath(rawPath string) string {
	if p := strings.TrimSuffix(rawPath, "/"); p != "" {
		return p
	}
	return "/"
}

// CanonicalPath strips the /api prefix CloudFront forwards.
func CanonicalPath(rawPath string) string {
	p := normalizePath(rawPath)
	if p == "/api" {
		return "/"
	}
	if rest, ok := strings.CutPrefix(p, "/api/"); ok {
		return "/" + rest
	}
	return p
}

type routeMatch struct {
	route  Route
	params map[string]string
}

func (rt *Router) pathMatches(path string) ([]routeMatch, error) {
	var out []routeMatch
	for _, r := range rt.routes {
		params, err := matchPattern(r.Pattern, path)
		if err != nil {
			return nil, err
		}
		if params != nil {
			out = append(out, routeMatch{r, params})
		}
	}
	return out, nil
}

// match is the most specific route for method and canonical path, if any.
func (rt *Router) match(method, path string) (routeMatch, bool) {
	matches, err := rt.pathMatches(path)
	if err != nil {
		return routeMatch{}, false
	}
	matches = slices.DeleteFunc(matches, func(m routeMatch) bool { return m.route.Method != method })
	if len(matches) == 0 {
		return routeMatch{}, false
	}
	sort.SliceStable(matches, func(a, b int) bool {
		return specificity(matches[a].route.Pattern) > specificity(matches[b].route.Pattern)
	})
	return matches[0], true
}

// Owns reports whether a route serves method on rawPath.
func (rt *Router) Owns(method, rawPath string) bool {
	_, ok := rt.match(strings.ToUpper(method), CanonicalPath(rawPath))
	return ok
}

// AuthFor is the auth of the route serving method on rawPath; Public when
// none does.
func (rt *Router) AuthFor(method, rawPath string) Auth {
	m, ok := rt.match(strings.ToUpper(method), CanonicalPath(rawPath))
	if !ok {
		return Public
	}
	return m.route.Auth
}

// dispatch returns the response with API headers, or the handler's error
// when it maps to no client status.
func (rt *Router) dispatch(ctx context.Context, req *Request, rawPath string) (*Response, error) {
	res, public, err := rt.dispatchMatched(ctx, req, rawPath)
	if err != nil {
		return nil, err
	}
	return withAPIHeaders(res, !public || res.Status >= 400), nil
}

// dispatchMatched reports public only when a public route matched.
func (rt *Router) dispatchMatched(ctx context.Context, req *Request, rawPath string) (res *Response, public bool, err error) {
	req.Method = strings.ToUpper(req.Method)
	req.Path = CanonicalPath(rawPath)

	matches, err := rt.pathMatches(req.Path)
	if err != nil {
		return mapError(err, req.Log, req.Metrics), false, nil
	}
	if len(matches) == 0 {
		req.Metrics.Add("NotFound", observability.Count, 1)
		return errorJSON(http.StatusNotFound, "not_found",
			"No route for "+req.Method+" "+normalizePath(rawPath)), false, nil
	}

	m, ok := rt.match(req.Method, req.Path)
	if !ok {
		req.Metrics.Add("MethodNotAllowed", observability.Count, 1)
		var allowed []string
		for _, pm := range matches {
			allowed = append(allowed, pm.route.Method)
		}
		slices.Sort(allowed)
		allowed = slices.Compact(allowed)
		list := strings.Join(allowed, ", ")
		res := errorJSON(http.StatusMethodNotAllowed, "method_not_allowed",
			"Method "+req.Method+" not allowed; use "+list)
		res.Headers["Allow"] = list
		return res, false, nil
	}

	public = m.route.Auth == Public
	req.Metrics.Add(m.route.metricName(), observability.Count, 1)
	if m.route.Auth != Public {
		if denied := authorize(m.route.Auth, req.Claims); denied != nil {
			return denied, false, nil
		}
	} else {
		req.Claims = nil
	}
	req.Params = m.params

	res, err = m.route.Handler(ctx, req)
	if err == nil && res == nil {
		err = errNilResponse
	}
	if err != nil {
		if mapped := mapError(err, req.Log, req.Metrics); mapped != nil {
			return mapped, public, nil
		}
		return nil, public, err
	}
	return res, public, nil
}

var errNilResponse = errors.New("api: handler returned no response")

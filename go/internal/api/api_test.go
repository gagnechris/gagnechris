package api

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/aws/aws-lambda-go/events"

	"github.com/gagnechris/gagnechris/go/internal/observability"
)

type testApp struct {
	app  *App
	logs *bytes.Buffer
	emf  *bytes.Buffer
}

func newTestApp(t *testing.T, routes ...Route) testApp {
	t.Helper()
	t.Setenv("ADMIN_WEB_CLIENT_ID", "admin-web")
	t.Setenv("NOTEBOOK_WEB_CLIENT_ID", "notebook-web")
	t.Setenv("IOS_CLIENT_ID", "ios")
	var logs, emf bytes.Buffer
	app := NewApp(
		NewRouter(append(Routes(nil), routes...)),
		observability.NewLogger(&logs, "gagnechris-api"),
		observability.NewMetrics(&emf, "gagnechris", "gagnechris-api"),
		time.Now(),
	)
	return testApp{app: app, logs: &logs, emf: &emf}
}

func (ta testApp) do(method, path string, claims map[string]string, headers map[string]string) *Response {
	if headers == nil {
		headers = map[string]string{}
	}
	req := &Request{Method: method, Headers: headers, Claims: claims, RequestID: "req-1", Query: map[string]string{}}
	return ta.app.Serve(context.Background(), req, path, nil)
}

func bodyOf(t *testing.T, r *Response) map[string]any {
	t.Helper()
	var out map[string]any
	if err := json.Unmarshal(r.Body, &out); err != nil {
		t.Fatalf("body %q: %v", r.Body, err)
	}
	return out
}

func metricNames(t *testing.T, emf *bytes.Buffer) []string {
	t.Helper()
	var names []string
	for line := range strings.SplitSeq(strings.TrimSpace(emf.String()), "\n") {
		if line == "" {
			continue
		}
		var doc struct {
			AWS struct {
				CloudWatchMetrics []struct {
					Metrics []struct{ Name string }
				}
			} `json:"_aws"`
		}
		if err := json.Unmarshal([]byte(line), &doc); err != nil {
			t.Fatal(err)
		}
		for _, d := range doc.AWS.CloudWatchMetrics[0].Metrics {
			names = append(names, d.Name)
		}
	}
	return names
}

func ok(body any) Handler {
	return func(context.Context, *Request) (*Response, error) { return JSON(http.StatusOK, body), nil }
}

func notebookClaims(groups string) map[string]string {
	return map[string]string{"sub": "u1", "token_use": "id", "aud": "notebook-web", "cognito:groups": groups}
}

func TestHealth(t *testing.T) {
	ta := newTestApp(t)

	for _, path := range []string{"/api/health", "/api/health/", "/health"} {
		res := ta.do("get", path, nil, nil)
		if res.Status != 200 {
			t.Fatalf("%s: status %d", path, res.Status)
		}
		if got := bodyOf(t, res); got["status"] != "ok" || got["service"] != "gagnechris-api" {
			t.Errorf("%s: body %v", path, got)
		}
		if res.Headers["X-Content-Type-Options"] != "nosniff" || res.Headers["Cache-Control"] != "" {
			t.Errorf("%s: headers %v", path, res.Headers)
		}
	}
	if got := metricNames(t, ta.emf); len(got) != 3 || got[0] != "HealthCheck" {
		t.Errorf("metrics %v, want HealthCheck per request", got)
	}
}

func TestRequestLog(t *testing.T) {
	ta := newTestApp(t)
	ta.do("GET", "/api/health", nil, nil)
	ta.do("GET", "/api/health", nil, nil)

	lines := strings.Split(strings.TrimSpace(ta.logs.String()), "\n")
	if len(lines) != 2 {
		t.Fatalf("logs %q", lines)
	}
	var first, second map[string]any
	_ = json.Unmarshal([]byte(lines[0]), &first)
	_ = json.Unmarshal([]byte(lines[1]), &second)
	if first["message"] != "request" || first["path"] != "/api/health" ||
		first["route"] != "GET /api/health" || first["requestId"] != "req-1" {
		t.Errorf("request log %v", first)
	}
	if _, ok := first["bundleReadyMs"]; !ok {
		t.Error("first request log has no bundleReadyMs")
	}
	if _, ok := second["bundleReadyMs"]; ok {
		t.Error("bundleReadyMs logged after the first request")
	}
}

func TestNotFoundAndMethodNotAllowed(t *testing.T) {
	ta := newTestApp(t,
		Route{Method: "PUT", Pattern: "/things/:id", Auth: Public, Handler: ok(nil)},
		Route{Method: "DELETE", Pattern: "/things/:id", Auth: Public, Handler: ok(nil)},
	)

	res := ta.do("GET", "/api/nope/", nil, nil)
	if res.Status != 404 || bodyOf(t, res)["message"] != "No route for GET /api/nope" ||
		res.Headers["Cache-Control"] != "no-store" {
		t.Errorf("404: %d %s %v", res.Status, res.Body, res.Headers)
	}

	res = ta.do("POST", "/api/things/1", nil, nil)
	body := bodyOf(t, res)
	if res.Status != 405 || res.Headers["Allow"] != "DELETE, PUT" ||
		body["error"] != "method_not_allowed" || body["message"] != "Method POST not allowed; use DELETE, PUT" {
		t.Errorf("405: %d %v %v", res.Status, body, res.Headers)
	}
	if got := metricNames(t, ta.emf); strings.Join(got, ",") != "NotFound,MethodNotAllowed" {
		t.Errorf("metrics %v", got)
	}
}

func TestParamsAndSpecificity(t *testing.T) {
	var got map[string]string
	capture := func(_ context.Context, r *Request) (*Response, error) {
		got = r.Params
		return JSON(200, map[string]string{"route": "param"}), nil
	}
	ta := newTestApp(t,
		Route{Method: "GET", Pattern: "/things/:id", Auth: Public, Handler: capture},
		Route{Method: "GET", Pattern: "/things/featured", Auth: Public, Handler: ok(map[string]string{"route": "literal"})},
		Route{Method: "GET", Pattern: "/files/:key+", Auth: Public, Handler: capture},
	)

	if b := bodyOf(t, ta.do("GET", "/api/things/featured", nil, nil)); b["route"] != "literal" {
		t.Errorf("literal route lost to the param route: %v", b)
	}
	ta.do("GET", "/api/things/a%20b", nil, nil)
	if got["id"] != "a b" {
		t.Errorf("id = %q", got["id"])
	}
	ta.do("GET", "/api/files/x/y%2Fz", nil, nil)
	if got["key"] != "x/y/z" {
		t.Errorf("key = %q", got["key"])
	}
	if got := metricNames(t, ta.emf); got[1] != "GET__things_id" {
		t.Errorf("default metric name %q", got[1])
	}

	for _, bad := range []string{"/api/things/%E0%A4%A", "/api/things/%C0"} {
		res := ta.do("GET", bad, nil, nil)
		if res.Status != 400 || bodyOf(t, res)["message"] != "Malformed path encoding" {
			t.Errorf("%s: %d %s", bad, res.Status, res.Body)
		}
	}
}

func TestAuth(t *testing.T) {
	ta := newTestApp(t,
		Route{Method: "GET", Pattern: "/notebook/notes", Auth: Notebook, Handler: ok(map[string]any{})},
	)
	cases := []struct {
		name    string
		claims  map[string]string
		status  int
		message string
	}{
		{"no claims", nil, 401, "Missing JWT claims"},
		{"wrong group", notebookClaims("[site-admin]"), 403, "Requires the notebook group"},
		{"other client", map[string]string{"sub": "u1", "token_use": "id", "aud": "admin-web", "cognito:groups": "[notebook]"},
			403, "Token is not from the notebook app client"},
		{"web", notebookClaims("[notebook]"), 200, ""},
		{"json groups", notebookClaims(`["notebook","x"]`), 200, ""},
		{"ios access token", map[string]string{"sub": "u1", "token_use": "access", "client_id": "ios", "cognito:groups": "[notebook]"}, 200, ""},
	}
	for _, c := range cases {
		res := ta.do("GET", "/api/notebook/notes", c.claims, nil)
		if res.Status != c.status {
			t.Errorf("%s: status %d, want %d", c.name, res.Status, c.status)
		}
		if c.message != "" && bodyOf(t, res)["message"] != c.message {
			t.Errorf("%s: body %s", c.name, res.Body)
		}
		if res.Headers["Cache-Control"] != "no-store" {
			t.Errorf("%s: protected response is not no-store", c.name)
		}
	}
}

func TestNewRouterRejectsMisdeclaredAuth(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Error("public route under /admin accepted")
		}
	}()
	NewRouter([]Route{{Method: "GET", Pattern: "/admin/posts", Auth: Public, Handler: ok(nil)}})
}

func TestHandlerErrors(t *testing.T) {
	version := 3
	ta := newTestApp(t,
		Route{Method: "GET", Pattern: "/conflict", Auth: Public, Handler: func(context.Context, *Request) (*Response, error) {
			return nil, &ConflictError{Message: "stale", Code: CodeVersionConflict, CurrentVersion: &version}
		}},
		Route{Method: "GET", Pattern: "/boom", Auth: Public, Handler: func(context.Context, *Request) (*Response, error) {
			return nil, errors.New("disk on fire")
		}},
		Route{Method: "GET", Pattern: "/panic", Auth: Public, Handler: func(context.Context, *Request) (*Response, error) {
			panic("nil map")
		}},
		Route{Method: "POST", Pattern: "/echo", Auth: Public, Handler: func(_ context.Context, r *Request) (*Response, error) {
			var v map[string]any
			if err := r.DecodeJSON(&v); err != nil {
				return nil, err
			}
			return JSON(200, v), nil
		}},
	)

	res := ta.do("GET", "/api/conflict", nil, nil)
	if b := bodyOf(t, res); res.Status != 409 || b["error"] != "version_conflict" || b["currentVersion"] != float64(3) ||
		res.Headers["Cache-Control"] != "no-store" {
		t.Errorf("conflict: %d %v %v", res.Status, b, res.Headers)
	}

	for _, path := range []string{"/api/boom", "/api/panic"} {
		res = ta.do("GET", path, nil, nil)
		if res.Status != 500 || string(res.Body) != `{"error":"internal_error"}` || res.Headers["Cache-Control"] != "no-store" {
			t.Errorf("%s: %d %s %v", path, res.Status, res.Body, res.Headers)
		}
	}
	if !strings.Contains(ta.logs.String(), `"errMessage":"disk on fire"`) || strings.Count(ta.logs.String(), `"message":"handler error"`) != 2 {
		t.Errorf("no handler error log in %s", ta.logs)
	}

	req := &Request{Method: "POST", Headers: map[string]string{}, Body: []byte("{nope"), RequestID: "r"}
	res = ta.app.Serve(context.Background(), req, "/api/echo", nil)
	if res.Status != 400 || bodyOf(t, res)["message"] != "Invalid JSON body" {
		t.Errorf("bad JSON: %d %s", res.Status, res.Body)
	}

	got := strings.Join(metricNames(t, ta.emf), ",")
	if !strings.Contains(got, "WriteConflict") || strings.Count(got, "HandlerError") != 2 {
		t.Errorf("metrics %s", got)
	}
}

func TestGzip(t *testing.T) {
	big := strings.Repeat("x", 2000)
	ta := newTestApp(t, Route{Method: "GET", Pattern: "/big", Auth: Public, Handler: ok(map[string]string{"v": big})})

	res := ta.do("GET", "/api/big", nil, map[string]string{"accept-encoding": "br, gzip"})
	if !res.Gzipped || res.Headers["Content-Encoding"] != "gzip" || res.Headers["Vary"] != "Accept-Encoding" {
		t.Fatalf("not gzipped: %v", res.Headers)
	}
	zr, err := gzip.NewReader(bytes.NewReader(res.Body))
	if err != nil {
		t.Fatal(err)
	}
	plain, _ := io.ReadAll(zr)
	if !strings.Contains(string(plain), big) {
		t.Error("gzip body does not round-trip")
	}

	if res := ta.do("GET", "/api/big", nil, nil); res.Gzipped {
		t.Error("gzipped without Accept-Encoding")
	}
	if res := ta.do("GET", "/api/health", nil, map[string]string{"accept-encoding": "gzip"}); res.Gzipped {
		t.Error("gzipped a small body")
	}
}

func TestJSONMatchesJSONStringify(t *testing.T) {
	if got := string(JSON(200, map[string]string{"html": "<a>&</a>"}).Body); got != `{"html":"<a>&</a>"}` {
		t.Errorf("got %s", got)
	}
	if got := JSONWithETag(200, map[string]int{}, 7).Headers["ETag"]; got != `"7"` {
		t.Errorf("ETag %s", got)
	}
}

func TestHandleLambda(t *testing.T) {
	big := strings.Repeat("y", 2000)
	ta := newTestApp(t,
		Route{Method: "GET", Pattern: "/notebook/me", Auth: Notebook, Handler: func(_ context.Context, r *Request) (*Response, error) {
			return JSON(200, map[string]string{"sub": r.UserID(), "big": big, "q": r.Query["q"]}), nil
		}},
	)
	event := events.APIGatewayV2HTTPRequest{
		RawPath:               "/api/notebook/me",
		Headers:               map[string]string{"Accept-Encoding": "gzip"},
		QueryStringParameters: map[string]string{"q": "1"},
		RequestContext: events.APIGatewayV2HTTPRequestContext{
			RequestID:  "abc",
			HTTP:       events.APIGatewayV2HTTPRequestContextHTTPDescription{Method: "GET"},
			Authorizer: &events.APIGatewayV2HTTPRequestContextAuthorizerDescription{JWT: &events.APIGatewayV2HTTPRequestContextAuthorizerJWTDescription{Claims: notebookClaims("[notebook]")}},
		},
	}
	out, err := ta.app.HandleLambda(context.Background(), event)
	if err != nil || out.StatusCode != http.StatusOK || !out.IsBase64Encoded || out.Headers["Cache-Control"] != "no-store" {
		t.Fatalf("%v %+v", err, out)
	}
	if !strings.Contains(ta.logs.String(), `"requestId":"abc"`) {
		t.Error("request log lacks the API Gateway request id")
	}
}

func TestHTTPHandlerClaimsAndFallback(t *testing.T) {
	var fallbackHits []string
	fallback := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fallbackHits = append(fallbackHits, r.Method+" "+r.URL.RequestURI()+" "+r.Header.Get(testClaimsHeader))
		w.WriteHeader(http.StatusTeapot)
	}))
	defer fallback.Close()
	target, _ := url.Parse(fallback.URL)

	ta := newTestApp(t,
		Route{Method: "GET", Pattern: "/notebook/me", Auth: Notebook, Handler: func(_ context.Context, r *Request) (*Response, error) {
			return JSON(200, map[string]string{"sub": r.UserID()}), nil
		}},
	)
	cases := []struct {
		mode   ClaimsMode
		header string
		value  string
		status int
		sub    string
	}{
		{ClaimsTest, testClaimsHeader, `{"sub":"t1","token_use":"id","aud":"notebook-web","cognito:groups":["notebook"]}`, 200, "t1"},
		{ClaimsTest, "", "", 401, ""},
		{ClaimsLocal, "Authorization", "Bearer local:alice", 200, "alice"},
		{ClaimsLocal, "Authorization", "Bearer local-ios:bob", 200, "bob"},
		{ClaimsLocal, "", "", 200, "local-dev-user"},
		{ClaimsNone, testClaimsHeader, `{"sub":"t1"}`, 401, ""},
	}
	for _, c := range cases {
		srv := httptest.NewServer(ta.app.HTTPHandler(c.mode, target))
		req, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/notebook/me", nil)
		if c.header != "" {
			req.Header.Set(c.header, c.value)
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		var body map[string]string
		_ = json.NewDecoder(res.Body).Decode(&body)
		_ = res.Body.Close()
		if res.StatusCode != c.status || body["sub"] != c.sub {
			t.Errorf("%s %s: %d %v", c.mode, c.value, res.StatusCode, body)
		}
		srv.Close()
	}

	srv := httptest.NewServer(ta.app.HTTPHandler(ClaimsTest, target))
	defer srv.Close()
	for _, path := range []string{"/api/notebook/notes?x=1", "/api/health"} {
		req, _ := http.NewRequest(http.MethodPost, srv.URL+path, nil)
		req.Header.Set(testClaimsHeader, `{"sub":"t1"}`)
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		_ = res.Body.Close()
		if res.StatusCode != http.StatusTeapot {
			t.Errorf("POST %s: %d, want the fallback's answer", path, res.StatusCode)
		}
	}
	want := []string{`POST /api/notebook/notes?x=1 {"sub":"t1"}`, `POST /api/health {"sub":"t1"}`}
	if strings.Join(fallbackHits, "|") != strings.Join(want, "|") {
		t.Errorf("fallback saw %q", fallbackHits)
	}
}

func TestLocalClaimsMatchNode(t *testing.T) {
	t.Setenv("ADMIN_WEB_CLIENT_ID", "")
	t.Setenv("IOS_CLIENT_ID", "")
	now := time.Unix(1700000000, 0)

	got := LocalClaims("local-dev-token", SiteAdmin, now)
	want := map[string]string{
		"sub": "local-dev-user", "email": "local@gagnechris.com", "cognito:username": "local-admin",
		"token_use": "id", "aud": "local-admin-web", "cognito:groups": "[site-admin]", "auth_time": "1700000000",
	}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("%s = %q, want %q", k, got[k], v)
		}
	}
	ios := LocalClaims("Bearer local-ios:sam", Notebook, now)
	if ios["aud"] != "local-ios" || ios["email"] != "sam@local.gagnechris.com" || ios["cognito:groups"] != "[notebook]" {
		t.Errorf("ios claims %v", ios)
	}
}

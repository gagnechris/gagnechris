package api

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
)

type Response struct {
	Status  int
	Headers map[string]string
	Body    []byte
	// Gzipped marks a compressed body; the Lambda adapter base64-encodes it.
	Gzipped bool
}

// JSON encodes v as JSON.stringify would: no HTML escaping, no trailing
// newline.
func JSON(status int, v any) *Response {
	return &Response{
		Status:  status,
		Headers: map[string]string{"Content-Type": "application/json"},
		Body:    marshal(v),
	}
}

func JSONWithETag(status int, v any, version int) *Response {
	r := JSON(status, v)
	r.Headers["ETag"] = `"` + strconv.Itoa(version) + `"`
	return r
}

func marshal(v any) []byte {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		panic(fmt.Sprintf("api: response does not encode: %v", err))
	}
	return bytes.TrimSuffix(buf.Bytes(), []byte("\n"))
}

// withAPIHeaders marks every response nosniff, and authenticated responses
// and errors no-store so Notebook JSON never lands in a browser disk cache.
func withAPIHeaders(r *Response, noStore bool) *Response {
	if r.Headers == nil {
		r.Headers = map[string]string{}
	}
	r.Headers["X-Content-Type-Options"] = "nosniff"
	if noStore {
		r.Headers["Cache-Control"] = "no-store"
	}
	return r
}

const gzipMinBytes = 1024

var acceptsGzip = regexp.MustCompile(`(?i)\bgzip\b`)

// gzipJSON compresses large JSON because neither API Gateway nor the
// no-cache CloudFront /api behavior does.
func gzipJSON(acceptEncoding string, r *Response) *Response {
	contentType := r.Headers["Content-Type"]
	if r.Gzipped || len(r.Body) < gzipMinBytes ||
		len(contentType) < len("application/json") ||
		contentType[:len("application/json")] != "application/json" ||
		!acceptsGzip.MatchString(acceptEncoding) {
		return r
	}
	var buf bytes.Buffer
	zw := gzip.NewWriter(&buf)
	_, _ = zw.Write(r.Body)
	_ = zw.Close()
	r.Body = buf.Bytes()
	r.Gzipped = true
	r.Headers["Content-Encoding"] = "gzip"
	r.Headers["Vary"] = "Accept-Encoding"
	return r
}

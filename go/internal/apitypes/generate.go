// Package apitypes holds the API's request and response types, generated from
// the OpenAPI file that packages/shared builds from its zod schemas.
package apitypes

//go:generate go tool -modfile=../../tools/go.mod oapi-codegen -config oapi-codegen.yaml ../../../packages/shared/openapi/openapi.json

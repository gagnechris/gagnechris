package api

import (
	"errors"
	"reflect"
	"testing"
)

func fieldCodes(t *testing.T, body string, check func(v *Validator)) map[string]string {
	t.Helper()
	v, err := NewValidator([]byte(body))
	if err != nil {
		t.Fatalf("%s: %v", body, err)
	}
	check(v)
	var bad *BadRequestError
	if err := v.Err(); errors.As(err, &bad) {
		return bad.Fields
	}
	return map[string]string{}
}

func TestValidatorCodes(t *testing.T) {
	check := func(v *Validator) {
		v.String("name", true, true, MinLen(1), MaxLen(3))
		v.String("email", false, true, Email, MaxLen(20))
		v.OptionalNonNegativeInt("n")
	}
	cases := []struct {
		body string
		want map[string]string
	}{
		{``, map[string]string{"name": CodeInvalidType}},
		{`{"name":"abc"}`, map[string]string{}},
		{`{"name":"\u00a0\ufeff"}`, map[string]string{"name": CodeTooSmall}},
		{`{"name":"😀😀😀"}`, map[string]string{}},
		{`{"name":"abcd","email":"x","n":-1}`, map[string]string{"name": CodeTooBig, "email": CodeInvalidFormat, "n": CodeTooSmall}},
		{`{"name":null,"email":5,"n":"1"}`, map[string]string{"name": CodeInvalidType, "email": CodeInvalidType, "n": CodeInvalidType}},
		{`{"name":"a","email":"averyveryverylongname@example.com"}`, map[string]string{"email": CodeTooBig}},
		{`{"name":"a","n":1.5}`, map[string]string{"n": CodeInvalidType}},
		{`{"name":"a","n":9007199254740992}`, map[string]string{"n": CodeTooBig}},
		{`{"name":"a","n":1e3}`, map[string]string{}},
		{`"x"`, map[string]string{"_root": CodeInvalidType}},
		{`null`, map[string]string{"_root": CodeInvalidType}},
	}
	for _, c := range cases {
		if got := fieldCodes(t, c.body, check); !reflect.DeepEqual(got, c.want) {
			t.Errorf("%s: %v, want %v", c.body, got, c.want)
		}
	}
	if _, err := NewValidator([]byte(`{"name":`)); !errors.Is(err, ErrInvalidJSONBody) {
		t.Errorf("truncated JSON: %v", err)
	}
}

func TestEmailMatchesZod(t *testing.T) {
	for addr, ok := range map[string]bool{
		"a@b.co": true, "o'neil@b.co": true, "A.b+c@Sub.Example.COM": true,
		"nope": false, "a..b@b.co": false, "a@b.c": false, "a@-b.co": false, "a.@b.co": false, "é@b.co": false,
	} {
		if got := Email(addr) == ""; got != ok {
			t.Errorf("%q valid = %v, want %v", addr, got, ok)
		}
	}
}

func TestTrimJS(t *testing.T) {
	if got := TrimJS("\ufeff\u3000 a \u0085"); got != "a \u0085" {
		t.Errorf("got %q", got)
	}
}

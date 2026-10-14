// Package contact serves the public contact form and the resume download
// notice: rate limited by caller IP and a global daily mail cap, and mailed
// to the site owner.
package contact

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/gagnechris/gagnechris/services/api/internal/api"
	"github.com/gagnechris/gagnechris/services/api/internal/contract"
	"github.com/gagnechris/gagnechris/services/api/internal/data"
	"github.com/gagnechris/gagnechris/services/api/internal/jstime"
	"github.com/gagnechris/gagnechris/services/api/internal/observability"
)

// Config is where mail goes and the domain its subjects name.
type Config struct {
	FromEmail  string
	ToEmail    string
	ApexDomain string
}

// WithDefaults fills an unset domain with the site's and, when local, unset
// addresses with local ones.
func (c Config) WithDefaults(local bool) Config {
	if local && c.FromEmail == "" {
		c.FromEmail = "local-from@gagnechris.com"
	}
	if local && c.ToEmail == "" {
		c.ToEmail = "local-to@gagnechris.com"
	}
	if c.ApexDomain == "" {
		c.ApexDomain = contract.Data.API.ApexDomain
	}
	return c
}

type Deps struct {
	Table  *data.Table
	Mail   Mailer
	Config Config
	Now    func() time.Time
}

func Routes(d Deps) []api.Route {
	if d.Now == nil {
		d.Now = time.Now
	}
	h := handlers{store: store{table: d.Table, now: d.Now}, mail: d.Mail, cfg: d.Config, now: d.Now}
	return []api.Route{
		{Method: http.MethodPost, Pattern: "/contact", Auth: api.Public, Metric: "ContactSubmit", Handler: h.contact},
		{Method: http.MethodPost, Pattern: "/resume/download", Auth: api.Public, Metric: "ResumeDownloadNotify", Handler: h.resumeDownload},
	}
}

// backend is the contact rows and rate counters; store keeps them in the data table.
type backend interface {
	consumeContactIP(ctx context.Context, ip string) (bool, error)
	save(ctx context.Context, name, email, message, sourceIP string) (string, error)
	consumeSESSend(ctx context.Context) (bool, error)
	consumeResumeSESSend(ctx context.Context) (bool, error)
	claimResumeNotifyIP(ctx context.Context, ip string) (bool, error)
	updateEmailStatus(ctx context.Context, contactID, status, emailError string) error
}

type handlers struct {
	store backend
	mail  Mailer
	cfg   Config
	now   func() time.Time
}

func (h handlers) send(ctx context.Context, m Mail) error {
	m.From, m.To = h.cfg.FromEmail, h.cfg.ToEmail
	return h.mail.Send(ctx, m)
}

var (
	okBody = map[string]bool{"ok": true}
	limits = contract.Data.Limits
)

func sourceIP(r *api.Request) string {
	if ip := api.TrimJS(r.SourceIP); ip != "" {
		return ip
	}
	return "unknown"
}

type contactForm struct {
	name, email, message string
	honeypot             bool
	elapsedMs            *int64
	formStartedAt        *int64
}

func parseContactForm(body []byte) (contactForm, error) {
	v, err := api.NewValidator(body)
	if err != nil {
		return contactForm{}, err
	}
	var f contactForm
	f.name, _ = v.String("name", true, true, api.MinLen(1), api.MaxLen(limits.ContactNameMaxLength))
	f.email, _ = v.String("email", true, true, api.Email, api.MaxLen(limits.ContactEmailMaxLength))
	f.message, _ = v.String("message", true, true, api.MinLen(1), api.MaxLen(limits.ContactMessageMaxLength))
	// Honeypots: `website` is still accepted so old bots keep tripping it.
	hp, _ := v.String("hp_field", false, false, api.MaxLen(limits.ContactHoneypotMaxLength))
	website, _ := v.String("website", false, false, api.MaxLen(limits.ContactHoneypotMaxLength))
	f.honeypot = api.TrimJS(hp) != "" || api.TrimJS(website) != ""
	if n, ok := v.Int("elapsedMs", false, api.NonNegative); ok {
		f.elapsedMs = &n
	}
	if n, ok := v.Int("formStartedAt", false, api.NonNegative); ok {
		f.formStartedAt = &n
	}
	return f, v.Err()
}

// tooFast is best effort: the timings are client-controlled, and the IP and
// mail caps are the hard limits. elapsedMs wins because a client-measured
// duration has no clock skew.
func (f contactForm) tooFast(now time.Time) bool {
	minMs := contract.Data.API.MinContactSubmitMs
	if f.elapsedMs != nil {
		return *f.elapsedMs < minMs
	}
	if f.formStartedAt == nil {
		return false
	}
	elapsed := now.UnixMilli() - *f.formStartedAt
	return elapsed >= 0 && elapsed < minMs
}

func (h handlers) contact(ctx context.Context, r *api.Request) (*api.Response, error) {
	form, err := parseContactForm(r.Body)
	if err != nil {
		return nil, err
	}
	if form.honeypot || form.tooFast(h.now()) {
		// Bots get no signal.
		return api.JSON(http.StatusOK, okBody), nil
	}

	ip := sourceIP(r)
	if ok, err := h.store.consumeContactIP(ctx, ip); err != nil {
		return nil, err
	} else if !ok {
		return nil, &api.RateLimitedError{Message: errContactIPLimit}
	}

	if ok, err := h.store.consumeSESSend(ctx); err != nil {
		return nil, err
	} else if !ok {
		r.Log.Warn("Daily email cap reached; contact message refused")
		r.Metrics.Add(contract.Data.API.Metrics.SESCapReached, observability.Count, 1)
		return nil, &api.RateLimitedError{Message: errSESDailyLimit}
	}

	contactID, err := h.store.save(ctx, form.name, form.email, form.message, ip)
	if err != nil {
		return nil, err
	}

	err = h.send(ctx, Mail{
		Subject: "[" + h.cfg.ApexDomain + "] Contact from " + form.name,
		ReplyTo: form.email,
		Text: strings.Join([]string{
			"Name: " + form.name,
			"Email: " + form.email,
			"ContactId: " + contactID,
			"",
			form.message,
		}, "\n"),
	})
	if err != nil {
		r.Log.Error("Contact email failed", "contactId", contactID, "errMessage", err.Error())
		r.Metrics.Add(contract.Data.API.Metrics.ContactEmailFailed, observability.Count, 1)
		h.tryUpdateEmailStatus(ctx, r, contactID, "failed", err.Error())
		return api.JSON(http.StatusBadGateway, map[string]string{
			"error":   "email_failed",
			"message": "Your message was saved but email delivery failed. Please try again later.",
		}), nil
	}

	// Never fail the visitor after the mail went out.
	h.tryUpdateEmailStatus(ctx, r, contactID, "sent", "")
	return api.JSON(http.StatusOK, okBody), nil
}

func (h handlers) tryUpdateEmailStatus(ctx context.Context, r *api.Request, contactID, status, emailError string) {
	if err := h.store.updateEmailStatus(ctx, contactID, status, emailError); err != nil {
		r.Log.Warn("Contact emailStatus update failed",
			"contactId", contactID, "status", status, "errMessage", err.Error())
		r.Metrics.Add(contract.Data.API.Metrics.ContactEmailStatusUpdateFailed, observability.Count, 1)
	}
}

func (h handlers) resumeDownload(ctx context.Context, r *api.Request) (*api.Response, error) {
	v, err := api.NewValidator(r.Body)
	if err != nil {
		return nil, err
	}
	referrer, _ := v.String("referrer", false, false, api.MaxLen(limits.ResumeReferrerMaxLength))
	if err := v.Err(); err != nil {
		return nil, err
	}

	ok := api.JSON(http.StatusOK, okBody)
	first, err := h.store.claimResumeNotifyIP(ctx, sourceIP(r))
	if err != nil {
		return nil, err
	}
	if !first {
		return ok, nil
	}
	if underCap, err := h.store.consumeResumeSESSend(ctx); err != nil {
		return nil, err
	} else if !underCap {
		r.Log.Info("Resume download notice skipped: its share of the daily email cap is used")
		return ok, nil
	}

	if referrer == "" {
		referrer = "(none)"
	}
	ua := r.Headers["user-agent"]
	if ua == "" {
		ua = "(none)"
	}
	// Best effort: the download already happened in the browser.
	err = h.send(ctx, Mail{
		Subject: "[" + h.cfg.ApexDomain + "] Resume downloaded",
		Text: strings.Join([]string{
			"A visitor downloaded the resume PDF.",
			"Time: " + jstime.ISO(h.now()),
			"Referrer: " + referrer,
			"User-Agent: " + ua,
		}, "\n"),
	})
	if err != nil {
		r.Log.Warn("Resume download email failed", "errMessage", err.Error())
	}
	return ok, nil
}

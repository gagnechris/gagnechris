package contact

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"os"
	"strings"
	"sync"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/sesv2"
	"github.com/aws/aws-sdk-go-v2/service/sesv2/types"
)

// Mail goes to the site owner, from and to the addresses in
// CONTACT_FROM_EMAIL and CONTACT_TO_EMAIL.
type Mail struct {
	Subject string
	Text    string
	ReplyTo string
}

type Mailer interface {
	Send(ctx context.Context, m Mail) error
}

func ownerAddresses() (from, to string, err error) {
	from = strings.TrimSpace(os.Getenv("CONTACT_FROM_EMAIL"))
	to = strings.TrimSpace(os.Getenv("CONTACT_TO_EMAIL"))
	if from == "" {
		return "", "", errors.New("CONTACT_FROM_EMAIL is not set")
	}
	if to == "" {
		return "", "", errors.New("CONTACT_TO_EMAIL is not set")
	}
	return from, to, nil
}

type SESMailer struct{ Client *sesv2.Client }

func (s SESMailer) Send(ctx context.Context, m Mail) error {
	from, to, err := ownerAddresses()
	if err != nil {
		return err
	}
	in := &sesv2.SendEmailInput{
		FromEmailAddress: aws.String(from),
		Destination:      &types.Destination{ToAddresses: []string{to}},
		Content: &types.EmailContent{Simple: &types.Message{
			Subject: &types.Content{Data: aws.String(m.Subject), Charset: aws.String("UTF-8")},
			Body:    &types.Body{Text: &types.Content{Data: aws.String(m.Text), Charset: aws.String("UTF-8")}},
		}},
	}
	if m.ReplyTo != "" {
		in.ReplyToAddresses = []string{m.ReplyTo}
	}
	_, err = s.Client.SendEmail(ctx, in)
	return err
}

// Outbox stands in for SES outside Lambda: each message is logged and, when
// File is set, appended to it as one JSON line in the shape
// services/api/local/outbox.ts writes.
type Outbox struct {
	File string
	Log  *slog.Logger
	mu   sync.Mutex
}

// UseLocalAddresses sets the local owner addresses where they are unset.
func UseLocalAddresses() {
	for name, value := range map[string]string{
		"CONTACT_FROM_EMAIL": "local-from@gagnechris.com",
		"CONTACT_TO_EMAIL":   "local-to@gagnechris.com",
	} {
		if strings.TrimSpace(os.Getenv(name)) == "" {
			_ = os.Setenv(name, value)
		}
	}
}

func (o *Outbox) Send(_ context.Context, m Mail) error {
	from, to, err := ownerAddresses()
	if err != nil {
		return err
	}
	o.Log.Info("outbox", "subject", m.Subject)
	if o.File == "" {
		return nil
	}
	replyTo := []string{}
	if m.ReplyTo != "" {
		replyTo = []string{m.ReplyTo}
	}
	line, err := json.Marshal(map[string]any{
		"from": from, "to": []string{to}, "replyTo": replyTo, "subject": m.Subject, "text": m.Text,
	})
	if err != nil {
		return err
	}
	o.mu.Lock()
	defer o.mu.Unlock()
	f, err := os.OpenFile(o.File, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	if _, err := f.Write(append(line, '\n')); err != nil {
		_ = f.Close()
		return err
	}
	return f.Close()
}

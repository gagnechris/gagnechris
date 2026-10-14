package contact

import (
	"context"
	"net/netip"
	"time"
	"unicode/utf16"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/oklog/ulid/v2"

	"github.com/gagnechris/gagnechris/services/api/internal/contract"
	"github.com/gagnechris/gagnechris/services/api/internal/data"
	"github.com/gagnechris/gagnechris/services/api/internal/jstime"
	"github.com/gagnechris/gagnechris/services/api/internal/keys"
)

// store is the contact rows and rate counters in the data table.
type store struct {
	table *data.Table
	now   func() time.Time
}

// tryIncrement adds one to a counter row unless it is already at max.
func (s store) tryIncrement(ctx context.Context, pk, sk string, maxCount int, ttl int64) (bool, error) {
	_, err := s.table.DB.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName:                aws.String(s.table.Name),
		Key:                      data.Key(pk, sk),
		UpdateExpression:         aws.String("ADD #count :one SET #ttl = if_not_exists(#ttl, :ttl), entityType = if_not_exists(entityType, :etype)"),
		ConditionExpression:      aws.String("attribute_not_exists(#count) OR #count < :max"),
		ExpressionAttributeNames: map[string]string{"#count": "count", "#ttl": "ttl"},
		ExpressionAttributeValues: data.Item{
			":one":   data.N(1),
			":max":   data.N(int64(maxCount)),
			":ttl":   data.N(ttl),
			":etype": data.S("rateLimit"),
		},
	})
	if err != nil && data.ClassifyWriteError(err) == data.WriteConflict {
		return false, nil
	}
	return err == nil, err
}

const errContactIPLimit = "Too many contact submissions from this address. Try again later."

const errSESDailyLimit = "Daily email quota reached. Try again tomorrow."

// rateKeyIP is the address a per-IP limit counts against. An IPv6 client
// usually holds a whole /64 and can rotate within it, so IPv6 counts per /64.
func rateKeyIP(ip string) string {
	addr, err := netip.ParseAddr(ip)
	if err != nil {
		return ip
	}
	addr = addr.Unmap()
	if addr.Is4() {
		return addr.String()
	}
	return netip.PrefixFrom(addr.WithZone(""), 64).Masked().String()
}

func (s store) consumeContactIP(ctx context.Context, ip string) (bool, error) {
	at := s.now()
	return s.tryIncrement(ctx, keys.RateContactIPPk(rateKeyIP(ip)), keys.RateHourSk(at),
		contract.Data.API.ContactPerIPPerHour, keys.TTLEndOfUTCHour(at))
}

// consumeSESSend runs before the contact row is saved, so a used-up cap
// stops the writes too.
func (s store) consumeSESSend(ctx context.Context) (bool, error) {
	at := s.now()
	return s.tryIncrement(ctx, keys.RateSESGlobalPk(), keys.RateDaySk(at),
		contract.Data.API.SESGlobalDailyCap, keys.TTLEndOfUTCDay(at))
}

// consumeResumeSESSend counts against the same daily total but stops at a
// lower cap, so resume notices never use up the contact form's mail.
func (s store) consumeResumeSESSend(ctx context.Context) (bool, error) {
	at := s.now()
	return s.tryIncrement(ctx, keys.RateSESGlobalPk(), keys.RateDaySk(at),
		contract.Data.API.ResumeNotifySESDailyCap, keys.TTLEndOfUTCDay(at))
}

func (s store) claimResumeNotifyIP(ctx context.Context, ip string) (bool, error) {
	at := s.now()
	return s.tryIncrement(ctx, keys.RateResumeIPPk(rateKeyIP(ip)), keys.RateDaySk(at), 1, keys.TTLEndOfUTCDay(at))
}

func (s store) save(ctx context.Context, name, email, message, sourceIP string) (string, error) {
	now := s.now()
	id := ulid.MustNew(ulid.Timestamp(now), ulid.DefaultEntropy()).String()
	item := data.Key(keys.ContactPk(id), keys.ContactMsgSk())
	item["entityType"] = data.S("contact")
	item["contactId"] = data.S(id)
	item["name"] = data.S(name)
	item["email"] = data.S(email)
	item["message"] = data.S(message)
	item["sourceIp"] = data.S(sourceIP)
	item["createdAt"] = data.S(jstime.ISO(now))
	item["emailStatus"] = data.S("pending")
	_, err := s.table.DB.PutItem(ctx, &dynamodb.PutItemInput{
		TableName:           aws.String(s.table.Name),
		Item:                item,
		ConditionExpression: aws.String("attribute_not_exists(pk)"),
	})
	return id, err
}

const maxEmailErrorUnits = 500

func (s store) updateEmailStatus(ctx context.Context, contactID, status, emailError string) error {
	in := &dynamodb.UpdateItemInput{
		TableName:                 aws.String(s.table.Name),
		Key:                       data.Key(keys.ContactPk(contactID), keys.ContactMsgSk()),
		UpdateExpression:          aws.String("SET emailStatus = :status REMOVE emailError"),
		ExpressionAttributeValues: data.Item{":status": data.S(status)},
	}
	if emailError != "" {
		in.UpdateExpression = aws.String("SET emailStatus = :status, emailError = :err")
		in.ExpressionAttributeValues[":err"] = data.S(truncateUnits(emailError, maxEmailErrorUnits))
	}
	_, err := s.table.DB.UpdateItem(ctx, in)
	return err
}

// truncateUnits keeps at most n UTF-16 units, like String.slice, without
// splitting a surrogate pair.
func truncateUnits(s string, n int) string {
	units := 0
	for i, r := range s {
		units += len(utf16.Encode([]rune{r}))
		if units > n {
			return s[:i]
		}
	}
	return s
}

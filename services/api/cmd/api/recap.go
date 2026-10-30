package main

import (
	"context"
	"encoding/json"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/lambda"
	"github.com/aws/aws-sdk-go-v2/service/lambda/types"

	"github.com/gagnechris/gagnechris/services/api/internal/notebook"
)

// lambdaRecaps queues each job on the recap function; the Event invoke
// returns once Lambda has accepted it.
type lambdaRecaps struct {
	client   *lambda.Client
	function string
}

func (l lambdaRecaps) StartRecap(ctx context.Context, job notebook.RecapJob) error {
	payload, err := json.Marshal(job)
	if err != nil {
		return err
	}
	_, err = l.client.Invoke(ctx, &lambda.InvokeInput{
		FunctionName:   aws.String(l.function),
		InvocationType: types.InvocationTypeEvent,
		Payload:        payload,
	})
	return err
}

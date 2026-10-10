package restoretest

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/backup"
	backuptypes "github.com/aws/aws-sdk-go-v2/service/backup/types"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	ddbtypes "github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

func requireEnv(name string) (string, error) {
	value := os.Getenv(name)
	if value == "" {
		return "", fmt.Errorf("%s is not set", name)
	}
	return value, nil
}

type awsEnv struct {
	sourceTableName, sourceTableArn, backupVaultName, planName, planArn string
}

func readEnv() (awsEnv, error) {
	var e awsEnv
	for _, v := range []struct {
		name string
		dst  *string
	}{
		{"SOURCE_TABLE_NAME", &e.sourceTableName},
		{"SOURCE_TABLE_ARN", &e.sourceTableArn},
		{"BACKUP_VAULT_NAME", &e.backupVaultName},
		{"RESTORE_TESTING_PLAN_NAME", &e.planName},
		{"RESTORE_TESTING_PLAN_ARN", &e.planArn},
	} {
		value, err := requireEnv(v.name)
		if err != nil {
			return e, err
		}
		*v.dst = value
	}
	return e, nil
}

func startKey(key map[string]ddbtypes.AttributeValue) StartKey {
	if len(key) == 0 {
		return nil
	}
	return key
}

func exclusiveStartKey(key StartKey) map[string]ddbtypes.AttributeValue {
	k, _ := key.(map[string]ddbtypes.AttributeValue)
	return k
}

func latest(dates []time.Time) time.Time {
	var newest time.Time
	for _, d := range dates {
		if d.After(newest) {
			newest = d
		}
	}
	return newest
}

// DepsFromEnv wires Deps to DynamoDB and AWS Backup with the function's
// environment and credentials.
func DepsFromEnv(ctx context.Context) (Deps, error) {
	env, err := readEnv()
	if err != nil {
		return Deps{}, err
	}
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return Deps{}, err
	}
	ddb := dynamodb.NewFromConfig(cfg)
	bk := backup.NewFromConfig(cfg)

	maxAge := DefaultLeftoverMaxAge
	if hours, err := strconv.ParseFloat(os.Getenv("LEFTOVER_MAX_AGE_HOURS"), 64); err == nil && hours > 0 {
		maxAge = time.Duration(hours * float64(time.Hour))
	}

	return Deps{
		SourceTableName:       env.sourceTableName,
		RestoreTestingPlanArn: env.planArn,
		LeftoverMaxAge:        maxAge,
		Now:                   time.Now,

		Scan: func(ctx context.Context, in ScanInput) (ScanPage, error) {
			out, err := ddb.Scan(ctx, &dynamodb.ScanInput{
				TableName:         aws.String(in.TableName),
				ExclusiveStartKey: exclusiveStartKey(in.ExclusiveStartKey),
			})
			if err != nil {
				return ScanPage{}, err
			}
			var items []Item
			if err := attributevalue.UnmarshalListOfMaps(out.Items, &items); err != nil {
				return ScanPage{}, err
			}
			return ScanPage{Items: items, LastEvaluatedKey: startKey(out.LastEvaluatedKey)}, nil
		},

		Count: func(ctx context.Context, in CountInput) (CountPage, error) {
			values := map[string]ddbtypes.AttributeValue{}
			for k, v := range in.ExpressionAttributeValues {
				values[k] = &ddbtypes.AttributeValueMemberS{Value: v}
			}
			out, err := ddb.Scan(ctx, &dynamodb.ScanInput{
				TableName:                 aws.String(in.TableName),
				Select:                    ddbtypes.SelectCount,
				FilterExpression:          aws.String(in.FilterExpression),
				ExpressionAttributeNames:  in.ExpressionAttributeNames,
				ExpressionAttributeValues: values,
				ExclusiveStartKey:         exclusiveStartKey(in.ExclusiveStartKey),
			})
			if err != nil {
				return CountPage{}, err
			}
			return CountPage{Count: int(out.Count), LastEvaluatedKey: startKey(out.LastEvaluatedKey)}, nil
		},

		DescribeRestoreJob: func(ctx context.Context, id string) (RestoreJobInfo, error) {
			out, err := bk.DescribeRestoreJob(ctx, &backup.DescribeRestoreJobInput{RestoreJobId: aws.String(id)})
			if err != nil {
				return RestoreJobInfo{}, err
			}
			info := RestoreJobInfo{RecoveryPointCreationDate: aws.ToTime(out.RecoveryPointCreationDate)}
			if out.CreatedBy != nil {
				info.RestoreTestingPlanArn = aws.ToString(out.CreatedBy.RestoreTestingPlanArn)
			}
			return info, nil
		},

		PutValidation: func(ctx context.Context, in PutValidationInput) error {
			_, err := bk.PutRestoreValidationResult(ctx, &backup.PutRestoreValidationResultInput{
				RestoreJobId:            aws.String(in.RestoreJobID),
				ValidationStatus:        backuptypes.RestoreValidationStatus(in.Status),
				ValidationStatusMessage: aws.String(in.Message),
			})
			return err
		},

		Leftovers: LeftoverDeps{
			ListTables: func(ctx context.Context, start string) (ListTablesPage, error) {
				in := &dynamodb.ListTablesInput{}
				if start != "" {
					in.ExclusiveStartTableName = aws.String(start)
				}
				out, err := ddb.ListTables(ctx, in)
				if err != nil {
					return ListTablesPage{}, err
				}
				return ListTablesPage{TableNames: out.TableNames, LastEvaluatedTableName: aws.ToString(out.LastEvaluatedTableName)}, nil
			},
			DescribeCreation: func(ctx context.Context, tableName string) (time.Time, error) {
				out, err := ddb.DescribeTable(ctx, &dynamodb.DescribeTableInput{TableName: aws.String(tableName)})
				var notFound *ddbtypes.ResourceNotFoundException
				if errors.As(err, &notFound) {
					return time.Time{}, nil
				}
				if err != nil {
					return time.Time{}, err
				}
				return aws.ToTime(out.Table.CreationDateTime), nil
			},
		},

		Freshness: FreshnessDeps{
			NewestRecoveryPoint: func(ctx context.Context, createdAfter time.Time) (time.Time, error) {
				var dates []time.Time
				pages := backup.NewListRecoveryPointsByBackupVaultPaginator(bk, &backup.ListRecoveryPointsByBackupVaultInput{
					BackupVaultName: aws.String(env.backupVaultName),
					ByResourceArn:   aws.String(env.sourceTableArn),
					ByCreatedAfter:  aws.Time(createdAfter),
				})
				for pages.HasMorePages() {
					page, err := pages.NextPage(ctx)
					if err != nil {
						return time.Time{}, err
					}
					for _, rp := range page.RecoveryPoints {
						if rp.Status == backuptypes.RecoveryPointStatusCompleted {
							dates = append(dates, aws.ToTime(rp.CreationDate))
						}
					}
				}
				return latest(dates), nil
			},
			NewestSuccessfulValidation: func(ctx context.Context, createdAfter time.Time) (time.Time, error) {
				var dates []time.Time
				pages := backup.NewListRestoreJobsPaginator(bk, &backup.ListRestoreJobsInput{
					ByRestoreTestingPlanArn: aws.String(env.planArn),
					ByCreatedAfter:          aws.Time(createdAfter),
				})
				for pages.HasMorePages() {
					page, err := pages.NextPage(ctx)
					if err != nil {
						return time.Time{}, err
					}
					for _, job := range page.RestoreJobs {
						if job.ValidationStatus == backuptypes.RestoreValidationStatusSuccessful {
							dates = append(dates, aws.ToTime(job.CreationDate))
						}
					}
				}
				return latest(dates), nil
			},
			RestoreTestingPlanCreatedAt: func(ctx context.Context) (time.Time, error) {
				out, err := bk.GetRestoreTestingPlan(ctx, &backup.GetRestoreTestingPlanInput{
					RestoreTestingPlanName: aws.String(env.planName),
				})
				var notFound *backuptypes.ResourceNotFoundException
				if errors.As(err, &notFound) {
					return time.Time{}, nil
				}
				if err != nil {
					return time.Time{}, err
				}
				if out.RestoreTestingPlan == nil {
					return time.Time{}, nil
				}
				return aws.ToTime(out.RestoreTestingPlan.CreationTime), nil
			},
			DynamoDBAdvancedBackupEnabled: func(ctx context.Context) (bool, error) {
				out, err := bk.DescribeRegionSettings(ctx, &backup.DescribeRegionSettingsInput{})
				if err != nil {
					return false, err
				}
				return out.ResourceTypeManagementPreference["DynamoDB"], nil
			},
		},
	}, nil
}

package users

import (
	"context"
	"errors"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	cip "github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider"
	"github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider/types"

	"github.com/gagnechris/gagnechris/services/api/internal/contract"
	"github.com/gagnechris/gagnechris/services/api/internal/store"
)

type CognitoDirectory struct {
	Client     *cip.Client
	UserPoolID string
}

func attr(attributes []types.AttributeType, name string) *string {
	for _, a := range attributes {
		if aws.ToString(a.Name) == name {
			return a.Value
		}
	}
	return nil
}

func toDirectoryUser(username *string, attributes []types.AttributeType, enabled bool, status types.UserStatusType, created *string, groups []string) DirectoryUser {
	id := attr(attributes, "sub")
	if id == nil {
		id = username
	}
	userStatus := string(status)
	if userStatus == "" {
		userStatus = "UNKNOWN"
	}
	if groups == nil {
		groups = []string{}
	}
	return DirectoryUser{
		ID:        aws.ToString(id),
		Email:     aws.ToString(attr(attributes, "email")),
		Name:      attr(attributes, "name"),
		Enabled:   enabled,
		Status:    userStatus,
		CreatedAt: created,
		Groups:    groups,
	}
}

func isoMillis(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := store.ISOTime(*t)
	return &s
}

func (d CognitoDirectory) ListUsers(ctx context.Context) ([]DirectoryUser, error) {
	var listed []types.UserType
	pages := cip.NewListUsersPaginator(d.Client, &cip.ListUsersInput{UserPoolId: &d.UserPoolID})
	for pages.HasMorePages() {
		page, err := pages.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		listed = append(listed, page.Users...)
	}

	// One call per group instead of one per user.
	groupsByUser := map[string][]string{}
	for _, group := range contract.Data.Users.AccessGroups {
		members := cip.NewListUsersInGroupPaginator(d.Client, &cip.ListUsersInGroupInput{
			UserPoolId: &d.UserPoolID,
			GroupName:  aws.String(group),
		})
		for members.HasMorePages() {
			page, err := members.NextPage(ctx)
			if err != nil {
				return nil, err
			}
			for _, m := range page.Users {
				name := aws.ToString(m.Username)
				groupsByUser[name] = append(groupsByUser[name], group)
			}
		}
	}

	out := make([]DirectoryUser, 0, len(listed))
	for _, u := range listed {
		out = append(out, toDirectoryUser(u.Username, u.Attributes, u.Enabled, u.UserStatus, isoMillis(u.UserCreateDate), groupsByUser[aws.ToString(u.Username)]))
	}
	return out, nil
}

func (d CognitoDirectory) GetUser(ctx context.Context, id string) (*DirectoryUser, error) {
	user, err := d.Client.AdminGetUser(ctx, &cip.AdminGetUserInput{UserPoolId: &d.UserPoolID, Username: &id})
	if err != nil {
		var missing *types.UserNotFoundException
		if errors.As(err, &missing) {
			return nil, nil
		}
		return nil, err
	}
	var groups []string
	pages := cip.NewAdminListGroupsForUserPaginator(d.Client, &cip.AdminListGroupsForUserInput{UserPoolId: &d.UserPoolID, Username: &id})
	// One page: a user is in at most the three access groups.
	page, err := pages.NextPage(ctx)
	if err != nil {
		var missing *types.UserNotFoundException
		if errors.As(err, &missing) {
			return nil, nil
		}
		return nil, err
	}
	for _, g := range page.Groups {
		if g.GroupName != nil && *g.GroupName != "" {
			groups = append(groups, *g.GroupName)
		}
	}
	u := toDirectoryUser(user.Username, user.UserAttributes, user.Enabled, user.UserStatus, isoMillis(user.UserCreateDate), groups)
	return &u, nil
}

func (d CognitoDirectory) FindByEmail(ctx context.Context, email string) (*DirectoryUser, error) {
	page, err := d.Client.ListUsers(ctx, &cip.ListUsersInput{
		UserPoolId: &d.UserPoolID,
		// The request schema only admits addresses without quotes.
		Filter: aws.String(`email = "` + email + `"`),
		Limit:  aws.Int32(1),
	})
	if err != nil {
		return nil, err
	}
	if len(page.Users) == 0 || aws.ToString(page.Users[0].Username) == "" {
		return nil, nil
	}
	return d.GetUser(ctx, *page.Users[0].Username)
}

func (d CognitoDirectory) InviteUser(ctx context.Context, email string, name *string) (DirectoryUser, error) {
	attributes := []types.AttributeType{
		{Name: aws.String("email"), Value: aws.String(email)},
		// The invite proves the address: it carries the temporary password.
		{Name: aws.String("email_verified"), Value: aws.String("true")},
	}
	if name != nil {
		attributes = append(attributes, types.AttributeType{Name: aws.String("name"), Value: name})
	}
	created, err := d.Client.AdminCreateUser(ctx, &cip.AdminCreateUserInput{
		UserPoolId:             &d.UserPoolID,
		Username:               aws.String(email),
		DesiredDeliveryMediums: []types.DeliveryMediumType{types.DeliveryMediumTypeEmail},
		UserAttributes:         attributes,
	})
	if err != nil {
		return DirectoryUser{}, err
	}
	u := created.User
	if u == nil {
		u = &types.UserType{}
	}
	return toDirectoryUser(u.Username, u.Attributes, u.Enabled, u.UserStatus, isoMillis(u.UserCreateDate), nil), nil
}

func (d CognitoDirectory) ResendInvite(ctx context.Context, email string) error {
	_, err := d.Client.AdminCreateUser(ctx, &cip.AdminCreateUserInput{
		UserPoolId:             &d.UserPoolID,
		Username:               aws.String(email),
		MessageAction:          types.MessageActionTypeResend,
		DesiredDeliveryMediums: []types.DeliveryMediumType{types.DeliveryMediumTypeEmail},
	})
	return err
}

func (d CognitoDirectory) AddToGroup(ctx context.Context, id, group string) error {
	_, err := d.Client.AdminAddUserToGroup(ctx, &cip.AdminAddUserToGroupInput{UserPoolId: &d.UserPoolID, Username: &id, GroupName: &group})
	return err
}

func (d CognitoDirectory) RemoveFromGroup(ctx context.Context, id, group string) error {
	_, err := d.Client.AdminRemoveUserFromGroup(ctx, &cip.AdminRemoveUserFromGroupInput{UserPoolId: &d.UserPoolID, Username: &id, GroupName: &group})
	return err
}

func (d CognitoDirectory) DisableUser(ctx context.Context, id string) error {
	_, err := d.Client.AdminDisableUser(ctx, &cip.AdminDisableUserInput{UserPoolId: &d.UserPoolID, Username: &id})
	return err
}

func (d CognitoDirectory) EnableUser(ctx context.Context, id string) error {
	_, err := d.Client.AdminEnableUser(ctx, &cip.AdminEnableUserInput{UserPoolId: &d.UserPoolID, Username: &id})
	return err
}

func (d CognitoDirectory) SignOutEverywhere(ctx context.Context, id string) error {
	_, err := d.Client.AdminUserGlobalSignOut(ctx, &cip.AdminUserGlobalSignOutInput{UserPoolId: &d.UserPoolID, Username: &id})
	return err
}

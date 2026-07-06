import { describe, expect, it } from 'vitest';
import Group from './Group';
import GroupMember from './GroupMember';
import User from './User';

describe('Sequelize model attribute access', () => {
  it.each([
    {
      name: 'User',
      instance: User.build({ username: 'alice', password: 'secret' }),
      attribute: 'username',
      expected: 'alice',
    },
    {
      name: 'Group',
      instance: Group.build({ name: 'team', ownerId: 1 }),
      attribute: 'name',
      expected: 'team',
    },
    {
      name: 'GroupMember',
      instance: GroupMember.build({ groupId: 1, userId: 2, role: 'owner' }),
      attribute: 'role',
      expected: 'owner',
    },
  ] as const)('$name exposes $attribute directly', ({ instance, attribute, expected }) => {
    const model = instance as unknown as Record<string, unknown> & {
      getDataValue(key: string): unknown;
    };

    expect(model.getDataValue(attribute)).toBe(expected);
    expect(model[attribute]).toBe(expected);
  });
});

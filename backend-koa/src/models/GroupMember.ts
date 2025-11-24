import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

export interface GroupMemberAttributes {
  id?: number;
  groupId: number;
  userId: number;
  role?: 'owner' | 'admin' | 'member';
  canSpeak?: boolean; // 是否可以发言
  joinedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

class GroupMember extends Model<GroupMemberAttributes> implements GroupMemberAttributes {
  public id!: number;
  public groupId!: number;
  public userId!: number;
  public role?: 'owner' | 'admin' | 'member';
  public canSpeak?: boolean;
  public joinedAt?: Date;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

GroupMember.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    groupId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    role: {
      type: DataTypes.ENUM('owner', 'admin', 'member'),
      defaultValue: 'member',
    },
    canSpeak: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    joinedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'group_members',
    timestamps: true,
  }
);

export default GroupMember;


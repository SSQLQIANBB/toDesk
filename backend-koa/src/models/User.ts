import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

export interface UserAttributes {
  id?: number;
  username: string;
  password: string;
  nickname?: string;
  avatar?: string;
  email?: string;
  phone?: string;
  bio?: string;
  status?: 'online' | 'offline' | 'busy';
  lastLoginAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

class User extends Model<UserAttributes> implements UserAttributes {
  public id!: number;
  public username!: string;
  public password!: string;
  public nickname?: string;
  public avatar?: string;
  public email?: string;
  public phone?: string;
  public bio?: string;
  public status?: 'online' | 'offline' | 'busy';
  public lastLoginAt?: Date;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

User.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    username: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    nickname: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    avatar: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    bio: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('online', 'offline', 'busy'),
      defaultValue: 'offline',
    },
    lastLoginAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'users',
    timestamps: true,
  }
);

export default User;


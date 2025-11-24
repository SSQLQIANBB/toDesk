import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

export interface GroupAttributes {
  id?: number;
  name: string;
  description?: string;
  avatar?: string;
  ownerId: number;
  createdAt?: Date;
  updatedAt?: Date;
}

class Group extends Model<GroupAttributes> implements GroupAttributes {
  public id!: number;
  public name!: string;
  public description?: string;
  public avatar?: string;
  public ownerId!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Group.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    avatar: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    ownerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'groups',
    timestamps: true,
  }
);

export default Group;


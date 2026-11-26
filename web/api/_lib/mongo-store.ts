import { MongoClient, type Collection } from "mongodb";
import type { Store } from "./store.js";
import type { BoardRec, TeamRec, UserRec, VersionRec } from "./types.js";

// MongoDB documents use our own string id as _id.
type UserDoc = Omit<UserRec, "id"> & { _id: string };
type BoardDoc = Omit<BoardRec, "id"> & { _id: string };
type TeamDoc = Omit<TeamRec, "id"> & { _id: string };
type VersionsDoc = { _id: string; versions: VersionRec[] }; // _id = the board id

const toUser = (d: UserDoc): UserRec => {
  const { _id, ...rest } = d;
  return { id: _id, ...rest };
};
const toBoard = (d: BoardDoc): BoardRec => {
  const { _id, ...rest } = d;
  return { id: _id, ...rest };
};

const toTeam = (d: TeamDoc): TeamRec => {
  const { _id, ...rest } = d;
  return { id: _id, ...rest };
};

// One connection is reused for every request that lands on the same warm serverless instance.
let clientPromise: Promise<MongoClient> | undefined;

export function createMongoStore(uri: string, dbName: string): Store {
  let indexes: Promise<unknown> | undefined;

  async function cols(): Promise<{ users: Collection<UserDoc>; boards: Collection<BoardDoc>; versions: Collection<VersionsDoc>; teams: Collection<TeamDoc> }> {
    try {
      clientPromise ??= new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 }).connect();
      const client = await clientPromise;
      const db = client.db(dbName);
      const users = db.collection<UserDoc>("users");
      const boards = db.collection<BoardDoc>("boards");
      const versions = db.collection<VersionsDoc>("versions");
      const teams = db.collection<TeamDoc>("teams");
      // creating an index that already exists does nothing, so this is safe on every cold start
      indexes ??= Promise.all([
        users.createIndex({ email: 1 }, { unique: true }),
        users.createIndex({ resetHash: 1 }, { sparse: true }),
        boards.createIndex({ ownerId: 1, updatedAt: -1 }),
        boards.createIndex({ "share.token": 1 }, { sparse: true }),
        boards.createIndex({ "members.userId": 1 }, { sparse: true }),
        boards.createIndex({ "invites.email": 1 }, { sparse: true }),
        boards.createIndex({ teamId: 1 }, { sparse: true }),
        teams.createIndex({ "members.userId": 1 }),
        teams.createIndex({ "invites.email": 1 }, { sparse: true }),
      ]);
      await indexes;
      return { users, boards, versions, teams };
    } catch (e) {
      clientPromise = undefined; // let the next request try to connect again
      indexes = undefined;
      throw e;
    }
  }

  return {
    async createUser(user) {
      const { users } = await cols();
      const { id, ...rest } = user;
      try {
        await users.insertOne({ _id: id, ...rest });
        return true;
      } catch (e) {
        if ((e as { code?: number }).code === 11000) return false; // duplicate e-mail
        throw e;
      }
    },
    async findUserByEmail(email) {
      const { users } = await cols();
      const d = await users.findOne({ email });
      return d ? toUser(d) : null;
    },
    async findUserById(id) {
      const { users } = await cols();
      const d = await users.findOne({ _id: id });
      return d ? toUser(d) : null;
    },
    async findUserByResetHash(hash) {
      const { users } = await cols();
      const d = await users.findOne({ resetHash: hash });
      return d ? toUser(d) : null;
    },
    async updateUser(id, patch) {
      const { users } = await cols();
      const $set: Record<string, unknown> = {};
      const $unset: Record<string, ""> = {};
      for (const [k, v] of Object.entries(patch)) (v === undefined ? ($unset[k] = "") : ($set[k] = v));
      const update: Record<string, unknown> = {};
      if (Object.keys($set).length) update.$set = $set;
      if (Object.keys($unset).length) update.$unset = $unset;
      if (Object.keys(update).length) await users.updateOne({ _id: id }, update);
    },
    async deleteUser(id) {
      const { users, boards, versions } = await cols();
      const ids = (await boards.find({ ownerId: id }, { projection: { _id: 1 } }).toArray()).map((b) => b._id);
      if (ids.length) await versions.deleteMany({ _id: { $in: ids } });
      await boards.deleteMany({ ownerId: id });
      await users.deleteOne({ _id: id });
    },
    async listBoards(ownerId) {
      const { boards } = await cols();
      return (await boards.find({ ownerId }).sort({ updatedAt: -1 }).limit(100).toArray()).map(toBoard);
    },
    async listSharedBoards(userId) {
      const { boards } = await cols();
      return (await boards.find({ "members.userId": userId }).sort({ updatedAt: -1 }).limit(100).toArray()).map(toBoard);
    },
    async findBoardsByInvite(email) {
      const { boards } = await cols();
      return (await boards.find({ "invites.email": email }).limit(50).toArray()).map(toBoard);
    },
    async findUsersByIds(ids) {
      const { users } = await cols();
      return ids.length ? (await users.find({ _id: { $in: ids } }).toArray()).map(toUser) : [];
    },
    async getBoard(id) {
      const { boards } = await cols();
      const d = await boards.findOne({ _id: id });
      return d ? toBoard(d) : null;
    },
    async findBoardByShareToken(token) {
      const { boards } = await cols();
      const d = await boards.findOne({ "share.token": token });
      return d ? toBoard(d) : null;
    },
    async insertBoard(board) {
      const { boards } = await cols();
      const { id, ...rest } = board;
      await boards.insertOne({ _id: id, ...rest });
    },
    async updateBoard(id, patch) {
      const { boards } = await cols();
      await boards.updateOne({ _id: id }, { $set: patch });
    },
    async deleteBoard(id) {
      const { boards, versions } = await cols();
      await boards.deleteOne({ _id: id });
      await versions.deleteOne({ _id: id });
    },
    async insertTeam(team) {
      const { teams } = await cols();
      const { id, ...rest } = team;
      await teams.insertOne({ _id: id, ...rest });
    },
    async getTeam(id) {
      const { teams } = await cols();
      const d = await teams.findOne({ _id: id });
      return d ? toTeam(d) : null;
    },
    async updateTeam(id, patch) {
      const { teams } = await cols();
      await teams.updateOne({ _id: id }, { $set: patch });
    },
    async deleteTeam(id) {
      const { teams } = await cols();
      await teams.deleteOne({ _id: id });
    },
    async listTeamsForUser(userId) {
      const { teams } = await cols();
      return (await teams.find({ "members.userId": userId }).limit(50).toArray()).map(toTeam);
    },
    async findTeamsByInvite(email) {
      const { teams } = await cols();
      return (await teams.find({ "invites.email": email }).limit(50).toArray()).map(toTeam);
    },
    async listTeamBoards(teamIds) {
      const { boards } = await cols();
      return teamIds.length ? (await boards.find({ teamId: { $in: teamIds } }).sort({ updatedAt: -1 }).limit(200).toArray()).map(toBoard) : [];
    },
    async getVersions(boardId) {
      const { versions } = await cols();
      return (await versions.findOne({ _id: boardId }))?.versions ?? [];
    },
    async setVersions(boardId, list) {
      const { versions } = await cols();
      await versions.replaceOne({ _id: boardId }, { versions: list }, { upsert: true });
    },
  };
}

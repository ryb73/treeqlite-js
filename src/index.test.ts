import { mkdirSync, rmdirSync } from "fs";
import { faker } from "@faker-js/faker";
import { SqliteError } from "better-sqlite3";
// eslint-disable-next-line @typescript-eslint/no-shadow
import { assert, beforeAll, describe, expect, test } from "vitest";
import type { TreeQLiteConfig } from "./nodejs";
import { TreeQLiteError, tqlAll, tqlExec, tqlQuery } from "./nodejs";

const tql: TreeQLiteConfig = {
  rootPath: `./test-db`,
};

type UserData = {
  username: string;
  email: string;
  password: string;
};

type ArtistData = {
  name: string;
  bio: string;
};

type AlbumData = {
  title: string;
  artist_id: number;
  release_date: string;
};

type SongData = {
  title: string;
  album_id: number;
  duration: number;
};

type PlaylistData = {
  name: string;
  user_id: number;
};

type PlaylistSongData = {
  playlist_id: number;
  song_id: number;
};

function generateUserData(): UserData {
  return {
    username: faker.internet.userName(),
    email: faker.internet.email(),
    password: faker.internet.password(),
  };
}

function generateArtistData(): ArtistData {
  return {
    name: faker.person.fullName(),
    bio: faker.lorem.sentences(),
  };
}

function generateAlbumData(artistId: number): AlbumData {
  return {
    title: faker.lorem.words(),
    artist_id: artistId,
    release_date: faker.date.past().toISOString(),
  };
}

function generateSongData(albumId: number): SongData {
  return {
    title: faker.music.songName(),
    album_id: albumId,
    duration: faker.number.int({ min: 120, max: 360 }),
  };
}

// eslint-disable-next-line unused-imports/no-unused-vars
function generatePlaylistData(userId: number): PlaylistData {
  return {
    name: faker.lorem.words(),
    user_id: userId,
  };
}

// eslint-disable-next-line unused-imports/no-unused-vars
function generatePlaylistSongData(
  playlistId: number,
  songId: number,
): PlaylistSongData {
  return {
    playlist_id: playlistId,
    song_id: songId,
  };
}

beforeAll(() => {
  // clear the test-db directory
  rmdirSync(tql.rootPath, { recursive: true });
  mkdirSync(tql.rootPath, { recursive: true });

  // create some tables
  const usersTableResult = tqlQuery(
    tql,
    `
      CREATE TABLE IF NOT EXISTS "~/users" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL
      );
    `,
  );
  expect(usersTableResult).toEqual({ changes: 0, lastInsertRowid: 0 });

  const artistsTableResult = tqlQuery(
    tql,
    `
      CREATE TABLE IF NOT EXISTS "~/artists" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        bio TEXT
      );
    `,
  );
  expect(artistsTableResult).toEqual({ changes: 0, lastInsertRowid: 0 });

  const albumsTableResult = tqlQuery(
    tql,
    `
      CREATE TABLE IF NOT EXISTS "~/albums" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        artist_id INTEGER NOT NULL,
        release_date DATE
      );
    `,
  );
  expect(albumsTableResult).toEqual({ changes: 0, lastInsertRowid: 0 });

  const songsTableResult = tqlQuery(
    tql,
    `
      CREATE TABLE IF NOT EXISTS "~/songs" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        album_id INTEGER,
        duration INTEGER
      );
    `,
  );
  expect(songsTableResult).toEqual({ changes: 0, lastInsertRowid: 0 });

  const playlistsTableResult = tqlQuery(
    tql,
    `
      CREATE TABLE IF NOT EXISTS "~/playlists" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        user_id INTEGER
      );
    `,
  );
  expect(playlistsTableResult).toEqual({ changes: 0, lastInsertRowid: 0 });

  const playlistSongsTableResult = tqlQuery(
    tql,
    `
      CREATE TABLE IF NOT EXISTS "~/playlist_songs" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playlist_id INTEGER NOT NULL,
        song_id INTEGER NOT NULL
      );
    `,
  );
  expect(playlistSongsTableResult).toEqual({ changes: 0, lastInsertRowid: 0 });
});

describe(`tqlQuery`, () => {
  test(`bare select`, () => {
    expect(tqlQuery(tql, `SELECT 1`)).toEqual({
      changes: 0,
      lastInsertRowid: 0,
    });
  });

  describe(`insert`, () => {
    describe(`good`, () => {
      test(`single`, () => {
        const userData = generateUserData();
        expect(
          tqlQuery(
            tql,
            `
            INSERT INTO "~/users" (username, email, password) VALUES (?, ?, ?)
          `,
            [userData.username, userData.email, userData.password],
          ),
        ).toEqual({ changes: 1, lastInsertRowid: 1 });
      });

      test(`multiple`, () => {
        const artistData1 = generateArtistData();
        const artistData2 = generateArtistData();
        expect(
          tqlQuery(
            tql,
            `
            INSERT INTO "~/artists" (name, bio) VALUES (?, ?), (?, ?)
          `,
            [
              artistData1.name,
              artistData1.bio,
              artistData2.name,
              artistData2.bio,
            ],
          ),
        ).toEqual({ changes: 2, lastInsertRowid: 2 });
      });
    });

    describe(`bad`, () => {
      test(`non-existent table`, () => {
        const query = `INSERT INTO "~/nonexistent_table" (name, bio) VALUES (?, ?)`;

        try {
          tqlQuery(tql, query, [
            faker.person.fullName(),
            faker.lorem.sentences(),
          ]);
        } catch (error) {
          assert(error instanceof TreeQLiteError);
          expect(error.message).toMatch(query);
          assert(error.cause instanceof SqliteError);
          expect(error.cause.message).toEqual(
            `no such table: ~/nonexistent_table`,
          );
        }
      });
    });
  });

  describe(`update`, () => {
    test(`single`, () => {
      const userData = generateUserData();

      const { lastInsertRowid } = tqlQuery(
        tql,
        `
          INSERT INTO "~/users" (username, email, password) VALUES (?, ?, ?)
        `,
        [userData.username, userData.email, userData.password],
      );

      const newUsername = faker.internet.userName();

      expect(
        tqlQuery(
          tql,
          `
            UPDATE "~/users" SET username = ? WHERE email = ?
          `,
          [newUsername, userData.email],
        ),
      ).toEqual({ changes: 1, lastInsertRowid: 0 });

      const selectResult = tqlAll(
        tql,
        `
          SELECT id, username, email, password FROM "~/users" WHERE email = ?
        `,
        [userData.email],
      );

      expect(selectResult).toEqual([
        {
          id: lastInsertRowid,
          username: newUsername,
          email: userData.email,
          password: userData.password,
        },
      ]);
    });
  });
});

describe(`tqlAll`, () => {
  test(`bare select`, () => {
    expect(tqlAll(tql, `SELECT 321 as "123"`)).toEqual([{ 123: 321 }]);
  });

  test(`select some albums`, () => {
    const artistData = generateArtistData();

    const { lastInsertRowid: artistId } = tqlQuery(
      tql,
      `
      INSERT INTO "~/artists" (name, bio) VALUES (?, ?)
      `,
      [artistData.name, artistData.bio],
    );

    assert(typeof artistId === `number`);

    const albumData1 = generateAlbumData(artistId);
    const albumData2 = generateAlbumData(artistId);
    const albumData3 = generateAlbumData(artistId);

    const { lastInsertRowid: lastAlbumId } = tqlQuery(
      tql,
      `
        INSERT INTO "~/albums" (title, artist_id, release_date) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)
      `,
      [
        albumData1.title,
        albumData1.artist_id,
        albumData1.release_date,
        albumData2.title,
        albumData2.artist_id,
        albumData2.release_date,
        albumData3.title,
        albumData3.artist_id,
        albumData3.release_date,
      ],
    );

    assert(typeof lastAlbumId === `number`);

    const selectResult = tqlAll(
      tql,
      `
        SELECT id, title, artist_id, release_date FROM "~/albums" WHERE artist_id = ?
      `,
      [artistId],
    );

    expect(selectResult).toEqual([
      {
        id: lastAlbumId - 2,
        title: albumData1.title,
        artist_id: albumData1.artist_id,
        release_date: albumData1.release_date,
      },
      {
        id: lastAlbumId - 1,
        title: albumData2.title,
        artist_id: albumData2.artist_id,
        release_date: albumData2.release_date,
      },
      {
        id: lastAlbumId,
        title: albumData3.title,
        artist_id: albumData3.artist_id,
        release_date: albumData3.release_date,
      },
    ]);
  });
});

describe(`tqlExec`, () => {
  test(`insert`, () => {
    const artistData = generateArtistData();

    const artistExecResult = tqlExec(
      tql,
      `
        INSERT INTO "~/artists" (name, bio) VALUES (?, ?)
      `,
      [artistData.name, artistData.bio],
    );

    assert(
      artistExecResult.type === `noData` &&
        typeof artistExecResult.result.lastInsertRowid === `number`,
    );

    const artistId = artistExecResult.result.lastInsertRowid;

    const albumData = generateAlbumData(artistId);

    const albumExecResult = tqlExec(
      tql,
      `
        INSERT INTO "~/albums" (title, artist_id, release_date) VALUES (?, ?, ?)
      `,
      [albumData.title, albumData.artist_id, albumData.release_date],
    );

    assert(
      albumExecResult.type === `noData` &&
        typeof albumExecResult.result.lastInsertRowid === `number`,
    );

    const albumId = albumExecResult.result.lastInsertRowid;

    const songData = generateSongData(albumId);

    const songExecResult = tqlExec(
      tql,
      `
        INSERT INTO "~/songs" (title, album_id, duration) VALUES (?, ?, ?)
      `,
      [songData.title, songData.album_id, songData.duration],
    );

    expect(songExecResult).toEqual({
      type: `noData`,
      result: { changes: 1, lastInsertRowid: 1 },
    });
  });
});

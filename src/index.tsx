//@ts-ignore
import {randomInt} from "node:crypto";
//@ts-ignore
import {rmSync} from "node:fs";
//@ts-ignore
import {mkdir, unlink} from "node:fs/promises";
//@ts-ignore
import cookie from "@elysiajs/cookie";
//@ts-ignore
import {html, Html} from "@elysiajs/html";
//@ts-ignore
import {staticPlugin} from "@elysiajs/static";
//@ts-ignore
import {Database} from "bun:sqlite";
//@ts-ignore
import {Elysia, t} from "elysia";
import {
    getConverterName,
    getPossibleTargets,
    mainConverter,
} from "./converters/main";
import {
  normalizeFiletype,
  normalizeOutputFiletype,
} from "./helpers/normalizeFiletype";
import "./helpers/printVersions";

//@ts-ignore
const _process = process as any
//@ts-ignore
const _console = console as any
//@ts-ignore
const _setTimeout = setTimeout as any
//@ts-ignore
const _Bun = Bun as any

mkdir("./data", { recursive: true }).catch(_console.error);
const db = new Database("./data/mydb.sqlite", { create: true });
const uploadsDir = "./data/uploads/";
const outputDir = "./public/";

const AUTO_DELETE_EVERY_N_HOURS = _process.env.AUTO_DELETE_EVERY_N_HOURS
  ? Number(_process.env.AUTO_DELETE_EVERY_N_HOURS)
  : 24;

const WEBROOT = _process.env.WEBROOT ?? "";

// init db if not exists
if (!db.query("SELECT * FROM sqlite_master WHERE type='table'").get()) {
  db.exec(`
CREATE TABLE IF NOT EXISTS jobs (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	originalFilename TEXT NOT NULL,
	convertedFilename TEXT NOT NULL,
	convertTo TEXT NOT NULL,
    status TEXT DEFAULT 'not started',
	createdAt TEXT NOT NULL
);
PRAGMA user_version = 1;`);
}

const dbVersion = (
  db.query("PRAGMA user_version").get() as { user_version?: number }
).user_version;
if (dbVersion === 0) {
  db.exec(
    "ALTER TABLE file_names ADD COLUMN status TEXT DEFAULT 'not started';",
  );
  db.exec("PRAGMA user_version = 1;");
  _console.log("Updated database to version 1.");
}

class Jobs {
    id!: number;
    originalFilename!: string
    convertedFilename!: string
    convertTo!: string
    status!: string;
    createdAt!: string;
}

// enable WAL mode
db.exec("PRAGMA journal_mode = WAL;");

const getTargetsFromFileType = (fileType: string) => {
    const targets: string[] = []

    Object.values(getPossibleTargets(fileType)).forEach(_targets => {
        _targets.forEach(target => {
            if (!targets.includes(target)) {
                targets.push(target)
            }
        })
    })

    return targets
}

const app = new Elysia({
  serve: {
    maxRequestBodySize: Number.MAX_SAFE_INTEGER,
  },
  prefix: WEBROOT,
})
  .use(cookie())
  .use(html())
  .use(
    staticPlugin(),
  )
    .get('/test', () => {
        return true
    })
  .get(
    "/conversions",
    ({ query }: any) => {
        const {fileType} = query

        return {
            targets: getTargetsFromFileType(fileType),
            converters: getPossibleTargets(fileType)
        }
    },
    { query: t.Object({ fileType: t.String() }) },
  )
  .post(
    "/jobs",
    async ({ body }: any) => {
        const {file, convertTo} = body
        const originalFilename = file["name"]



        const fileTypeOrig = originalFilename.split(".").pop() ?? "";
        const fileType = normalizeFiletype(fileTypeOrig);
        const convertToNormalized = normalizeFiletype(convertTo ?? "");
        const converterName = getConverterName(fileTypeOrig, convertTo)
        const newFileExt = normalizeOutputFiletype(convertToNormalized);
        const newFileName = originalFilename.replace(
            new RegExp(`${fileTypeOrig}(?!.*${fileTypeOrig})`),
            newFileExt,
        ).replaceAll(' ', '_');

        const {lastInsertRowid} = db.query("INSERT INTO jobs (originalFilename, convertedFilename, convertTo, createdAt) VALUES (?, ?, ?, ?)").run(
            originalFilename,
            newFileName,
            convertTo,
            new Date().toISOString(),
        );

        let job = db
            .query("SELECT * FROM jobs WHERE id = ?")
            .get(lastInsertRowid);

        const userUploadsDir = `${uploadsDir}${job.id}/`;
        const filePath = `${userUploadsDir}${originalFilename}`;

        if (body?.file) {
            await _Bun.write(`${userUploadsDir}${originalFilename}`, body.file);
        }

        const userOutputDir = `${outputDir}${job.id}/`;

        // create the output directory
        try {
            await mkdir(userOutputDir, { recursive: true });
        } catch (error) {
            _console.error(
                `Failed to create the output directory: ${userOutputDir}.`,
                error,
            );
        }

        db.query(
            "UPDATE jobs SET status = 'pending' WHERE id = ?",
        ).run(job.id);


        const targetPath = `${userOutputDir}${newFileName}`;

        const result = await mainConverter(
            filePath,
            fileType,
            convertToNormalized,
            targetPath,
            {},
            converterName,
        );

        db.query("UPDATE jobs SET status = ? WHERE id = ?").run(
            result,
            job.id,
        );

        job = db
            .query("SELECT * FROM jobs WHERE id = ?")
            .get(job.id);

        // delete all uploaded files in userUploadsDir
        rmSync(userUploadsDir, { recursive: true, force: true });


        return job

    },
    { body: t.Object({ file: t.File(), convertTo: t.String() }) },
  )
  .delete(
    "/jobs/:jobId/:filename",
    async ({ params }: any) => {
        const {jobId, filename} = params


      const existingJob = await db
        .query("SELECT * FROM jobs WHERE id = ?")
        .get(jobId);

        if (!existingJob) {
            return 'Job does not exist'
        }

      const userUploadsDir = `${uploadsDir}${jobId}/`;

      try {
          await unlink(`${userUploadsDir}${filename}`);
          return 'File deleted'
      } catch (error) {
          return 'File could not be deleted, maybe not found'
      }
    },
    { params: t.Object({ filename: t.String(), jobId:t.Number() }) },
  )
  .get("/jobs", async ({}: any) => {
    let userJobs = db
      .query("SELECT * FROM jobs")
      .as(Jobs)
      .all()
      .reverse();

    return userJobs
  })
  .get(
    "/jobs/:jobId",
    async ({ params, set }: any) => {

      const job = db
        .query("SELECT * FROM jobs WHERE id = ?")
        .as(Jobs)
        .get(params.jobId);

      if (!job) {
        set.status = 404;
        return {
          message: "Job not found.",
        };
      }

      const outputPath = `${params.jobId}/`;

      return job
    },
    { params: t.Object({ jobId:t.Number() }) },
  )
  .onError(({ error }: any) => {
    // log.error(` ${request.method} ${request.url}`, code, error);
    _console.error(error);
  });

app.listen(3000);

_console.log(
  `🦊 Elysia is running at http://${app.server?.hostname}:${app.server?.port}${WEBROOT}`,
);

const clearJobs = () => {
  const jobs = db
    .query("SELECT * FROM jobs WHERE createdAt < ?")
    .as(Jobs)
    .all(
      new Date(
        Date.now() - AUTO_DELETE_EVERY_N_HOURS * 60 * 60 * 1000,
      ).toISOString(),
    );

  for (const job of jobs) {
    // delete the directories
    rmSync(`${outputDir}${job.id}`, {
      recursive: true,
      force: true,
    });
    rmSync(`${uploadsDir}${job.id}`, {
      recursive: true,
      force: true,
    });

    // delete the job
    db.query("DELETE FROM jobs WHERE id = ?").run(job.id);
  }

  _setTimeout(clearJobs, AUTO_DELETE_EVERY_N_HOURS * 60 * 60 * 1000);
};

if (AUTO_DELETE_EVERY_N_HOURS > 0) {
  clearJobs();
}

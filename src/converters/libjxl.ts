import { exec } from "node:child_process";

// declare possible conversions
export const properties = {
  from: {
    jxl: ["jxl"],
    images: [
      "apng",
      "exr",
      "gif",
      "jpeg",
      "pam",
      "pfm",
      "pgm",
      "pgx",
      "png",
      "ppm",
    ],
  },
  to: {
    jxl: [
      "apng",
      "exr",
      "gif",
      "jpeg",
      "pam",
      "pfm",
      "pgm",
      "pgx",
      "png",
      "ppm",
    ],
    images: ["jxl"],
  },
};

export function convert(
  filePath: string,
  fileType: string,
  convertTo: string,
  targetPath: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  options?: unknown,
): Promise<string> {
  let tool = "";
  if (fileType === "jxl") {
    tool = "djxl";
  }

  if (convertTo === "jxl") {
    tool = "cjxl";
  }

  return new Promise((resolve, reject) => {
    exec(`${tool} "${filePath}" "${targetPath}"`, (error, stdout, stderr) => {
      if (error) {
        reject(`error: ${error}`);
      }

      if (stdout) {
        console.log(`stdout: ${stdout}`);
      }

      if (stderr) {
        console.error(`stderr: ${stderr}`);
      }

      resolve("completed");
    });
  });
}

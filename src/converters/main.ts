import { normalizeFiletype } from "../helpers/normalizeFiletype";
import { convert as convertassimp, properties as propertiesassimp } from "./assimp";
import { convert as convertFFmpeg, properties as propertiesFFmpeg } from "./ffmpeg";
import { convert as convertGraphicsmagick, properties as propertiesGraphicsmagick } from "./graphicsmagick";
import { convert as convertInkscape, properties as propertiesInkscape } from "./inkscape";
import { convert as convertLibjxl, properties as propertiesLibjxl } from "./libjxl";
import { convert as convertPandoc, properties as propertiesPandoc } from "./pandoc";
import { convert as convertresvg, properties as propertiesresvg } from "./resvg";
import { convert as convertImage, properties as propertiesImage } from "./vips";
import { convert as convertxelatex, properties as propertiesxelatex } from "./xelatex";
import { convert as convertCalibre, properties as propertiesCalibre } from "./calibre";
import { convert as convertLibheif, properties as propertiesLibheif } from "./libheif";


// This should probably be reconstructed so that the functions are not imported instead the functions hook into this to make the converters more modular

const properties: Record<
  string,
  {
    properties: {
      from: Record<string, string[]>;
      to: Record<string, string[]>;
      options?: Record<
        string,
        Record<
          string,
          {
            description: string;
            type: string;
            default: number;
          }
        >
      >;
    };
    converter: (
      filePath: string,
      fileType: string,
      convertTo: string,
      targetPath: string,

      options?: unknown,
    ) => unknown;
  }
> = {
  libjxl: {
    properties: propertiesLibjxl,
    converter: convertLibjxl,
  },
  resvg: {
    properties: propertiesresvg,
    converter: convertresvg,
  },
  libheif: {
    properties: propertiesLibheif,
    converter: convertLibheif,
  },
  vips: {
    properties: propertiesImage,
    converter: convertImage,
  },
  xelatex: {
    properties: propertiesxelatex,
    converter: convertxelatex,
  },
  calibre: {
    properties: propertiesCalibre,
    converter: convertCalibre,
  },
  pandoc: {
    properties: propertiesPandoc,
    converter: convertPandoc,
  },
  graphicsmagick: {
    properties: propertiesGraphicsmagick,
    converter: convertGraphicsmagick,
  },
  inkscape: {
    properties: propertiesInkscape,
    converter: convertInkscape,
  },
  assimp: {
    properties: propertiesassimp,
    converter: convertassimp,
  },
  ffmpeg: {
    properties: propertiesFFmpeg,
    converter: convertFFmpeg,
  },
};

export async function mainConverter(
  inputFilePath: string,
  fileTypeOriginal: string,
  convertTo: string,
  targetPath: string,
  options?: unknown,
  converterName?: string,
) {
  const fileType = normalizeFiletype(fileTypeOriginal);

  let converterFunc: typeof properties["libjxl"]["converter"] | undefined;

  if (converterName) {
    converterFunc = properties[converterName]?.converter;
  } else {
    // Iterate over each converter in properties
    for (converterName in properties) {
      const converterObj = properties[converterName];

      if (!converterObj) {
        break;
      }

      for (const key in converterObj.properties.from) {
        if (
          converterObj?.properties?.from[key]?.includes(fileType) &&
          converterObj?.properties?.to[key]?.includes(convertTo)
        ) {
          converterFunc = converterObj.converter;
          break;
        }
      }
    }
  }

  if (!converterFunc) {
    console.log(
      `No available converter supports converting from ${fileType} to ${convertTo}.`,
    );
    return "File type not supported";
  }

  try {
    const result = await converterFunc(
      inputFilePath,
      fileType,
      convertTo,
      targetPath,
      options,
    );

    console.log(
      `Converted ${inputFilePath} from ${fileType} to ${convertTo} successfully using ${converterName}.`,
      result,
    );

    if (typeof result === "string") {
      return result;
    }

    return "completed";
  } catch (error) {
    console.error(
      `Failed to convert ${inputFilePath} from ${fileType} to ${convertTo} using ${converterName}.`,
      error,
    );
    return "errored";
  }
}

const possibleTargets: Record<string, Record<string, string[]>> = {};

for (const converterName in properties) {
  const converterProperties = properties[converterName]?.properties;

  if (!converterProperties) {
    continue;
  }

  for (const key in converterProperties.from) {
    if (converterProperties.from[key] === undefined) {
      continue;
    }

    for (const extension of converterProperties.from[key] ?? []) {
      if (!possibleTargets[extension]) {
        possibleTargets[extension] = {};
      }

      possibleTargets[extension][converterName] =
        converterProperties.to[key] || [];
    }
  }
}

export const getPossibleTargets = (from: string): Record<string, string[]> => {
  const fromClean = normalizeFiletype(from);

  return possibleTargets[fromClean] || {};
};

const possibleInputs: string[] = [];
for (const converterName in properties) {
  const converterProperties = properties[converterName]?.properties;

  if (!converterProperties) {
    continue;
  }

  for (const key in converterProperties.from) {
    for (const extension of converterProperties.from[key] ?? []) {
      if (!possibleInputs.includes(extension)) {
        possibleInputs.push(extension);
      }
    }
  }
}
possibleInputs.sort();

export const getConverterName = (sourceFileType: string, targetFileType: string) => {
  const normalizedTarget = normalizeFiletype(targetFileType)

  const targets = getPossibleTargets(sourceFileType)
  return Object.entries(targets).filter(([converter, targets]) => targets.find(t => t === normalizedTarget))?.[0]?.[0]


}
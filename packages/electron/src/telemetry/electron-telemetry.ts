import { app } from "electron";
import {
  metricsBuffer,
  electronLogBuffer,
  backendLogBuffer,
  reactErrorBuffer,
} from "../models/buffer";
import {
  ProjectApiAnalysisResult,
  PackageAnalysisResult,
} from "@porting-assistant/react/src/models/project";
import { SolutionDetails } from "@porting-assistant/react/src/models/solution";
import crypto from "crypto";
import fs from "fs";
import log, { LogMessage, LevelOption, info } from "electron-log";
import { Connection } from "electron-cgi/connection";
import { putMetricData } from "./electron-metrics";
import { localStore } from "../preload-localStore";
import path from "path";
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

const logFileName = "porting-assistant-%DATE%";

const BACKEND_LOG = "portingAssistant-backend-logs";
const ELECTRON_LOG = "electron-logs";
const REACT_ERROR = "react-errors";

const dirName = path.join(app.getPath("userData"), "telemetry-logs");

if (!fs.existsSync(dirName))
  fs.mkdir(dirName, (err) => {
    console.log("Telemetry Directory Creation Failed.");
  });

var winstonTransports = [
  new DailyRotateFile({
    datePattern: "YYYY-MM-DD",
    extension: ".log",
    filename: logFileName,
    dirname: dirName,
    maxSize: 1024 * 1024,
    maxFiles: 20,
    format: winston.format.combine(
      winston.format.printf((info) => {
        return `${info.message}`;
      })
    ),
  }),
];

var logger = winston.createLogger({
  transports: winstonTransports,
  exitOnError: false,
});

export const logReactMetrics = (response: any) => {
  const targetFramework =
    localStore.get("targetFramework").id || "netcoreapp3.1";
  // Error with MetaData
  const errorMetric = {
    Type: REACT_ERROR,
    Content: {
      Metrics: {
        Status: "failed",
      },
      TimeStamp: new Date(),
      ListMetrics: [
        {
          Error: response,
        },
      ],
      Dimensions: [
        {
          Name: "metricsType",
          Value: "portingAssistant-react-errors",
        },
        {
          Name: "portingAssistantVersion",
          Value: app.getVersion(),
        },
        {
          Name: "targetFramework",
          Value: targetFramework,
        },
      ],
    },
  };
  logger.info(JSON.stringify(errorMetric));
};

export const logSolutionMetrics = (response: any, time: number) => {
  try {
    if (response.status.status === "Failure") {
      errorHandler(response, "Solutions");
    } else if (response.status.status === "Success") {
      const solutionDetails: SolutionDetails = response.value;
      const targetFramework =
        localStore.get("targetFramework").id || "netcoreapp3.1";

      let allpackages = new Set(
        solutionDetails.projects
          .flatMap((project) => {
            return project.packageReferences;
          })
          .filter((p) => p !== undefined || p !== null)
      );
    }
  } catch (err) {}
};

export const logApiMetrics = (response: any) => {
  try {
    if (response.status.status !== "Success") {
      return;
    }
    const projectAnalysis: ProjectApiAnalysisResult = response.value;
    const targetFramework =
      localStore.get("targetFramework").id || "netcoreapp3.1";
    if (
      projectAnalysis.sourceFileAnalysisResults != null &&
      projectAnalysis.projectFile != null
    ) {
      //Metrics with ListMetrics and MetaData
      const apis = projectAnalysis.sourceFileAnalysisResults.flatMap(
        (sourceFileAnalysisResults) =>
          sourceFileAnalysisResults.apiAnalysisResults.map((invocation) => {
            return {
              name: invocation.codeEntityDetails.name,
              namespace: invocation.codeEntityDetails.namespace,
              originalDefinition: invocation.codeEntityDetails?.signature,
              compatibility:
                invocation.compatibilityResults[targetFramework]?.compatibility,
            };
          })
      );
    }
  } catch (err) {}
};


export const registerLogListeners = (connection: Connection) => {
  const targetFramework =
    localStore.get("targetFramework").id || "netcoreapp3.1";
  // Electron Logs
  const transport = (message: LogMessage) => {
    try {
      const str: string = message.data[0];
      if (str) {
        const logs = {
          Type: ELECTRON_LOG,
          Content: {
            portingAssistantVersion: app.getVersion(),
            targetFramework: targetFramework,
            content: str,
          },
        };
        logger.info(JSON.stringify(logs));
      }
    } catch (err) {}
  };
  transport.level = "warn" as LevelOption;
  log.transports["electron"] = transport;

  //Backend Logs
  connection.on("onDataUpdate", (response) => {
    try {
      const logs = {
        Type: BACKEND_LOG,
        Content: {
          portingAssistantVersion: app.getVersion(),
          targetFramework: targetFramework,
          content: response,
        },
      };
      console.log("Writing Log to Buffer");
      logger.info(JSON.stringify(logs));
    } catch (err) {}
  });

  //Metrics
  connection.on("onApiAnalysisUpdate", (response) => {
    try {
      logApiMetrics(response);
    } catch (err) {}
  });

};

export const startTimer = () => {
  const time = new Date().getTime();
  return () => {
    const endTime = new Date();
    const elapseTime = endTime.getTime() - time;
    return elapseTime;
  };
};

export const errorHandler = (response: any, metricsType: string) => {
  // Error with MetaData
  const errorValue = response.errorValue;
  const error = response.status.error;
  const targetFramework =
    localStore.get("targetFramework").id || "netcoreapp3.1";
  // Error Metric
  putMetricData("portingAssistant-backend-errors", "Error", "Count", 1, [
    {
      Name: "metricsType",
      Value: metricsType,
    },
    {
      Name: "portingAssistantVersion",
      Value: app.getVersion(),
    },
    {
      Name: "targetFramework",
      Value: targetFramework,
    },
  ]).catch((error) => {
    return;
  });
};
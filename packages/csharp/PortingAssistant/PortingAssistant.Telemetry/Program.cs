using System;
using System.IO;
using System.Net.Http;
using System.Collections.Generic;
using PortingAssistant.Client.Model;
using ElectronCgi.DotNet;
using PortingAssistantExtensionTelemetry.Model;
using PortingAssistant.Telemetry.Utils;

namespace PortingAssistant.Telemetry
{
    class Program
    {
        public static void Main(string[] args)
        {
            if (args.Length < 3)
            {
                throw new ArgumentException
                    (
                    "Must provide a telemetry config file, " +
                    "aws profile and user data path."
                    );
            }

            var config = args[0];
            var profile = args[1];
            var userData = args[2];

            Connection _connection = new ConnectionBuilder().WithLogging().Build();
            var portingAssistantPortingConfiguration = System.Text.Json.JsonSerializer.Deserialize<PortingAssistantPortingConfiguration>(File.ReadAllText(config));
            string metricsFolder = Path.Combine(userData, "logs");
            TelemetryConfiguration teleConfig = new TelemetryConfiguration{
              InvokeUrl = portingAssistantPortingConfiguration.PortingAssistantMetrics["InvokeUrl"].ToString(),
              Region = portingAssistantPortingConfiguration.PortingAssistantMetrics["Region"].ToString(),
              ServiceName = portingAssistantPortingConfiguration.PortingAssistantMetrics["ServiceName"].ToString(),
              Description = portingAssistantPortingConfiguration.PortingAssistantMetrics["Description"].ToString(),
              LogsPath = metricsFolder,
              LogFilePath = Path.Combine(metricsFolder, $"portingAssistant-telemetry-{DateTime.Today.ToString("yyyyMMdd")}.log"),
              MetricsFilePath = Path.Combine(metricsFolder, $"portingAssistant-telemetry-{DateTime.Today.ToString("yyyyMMdd")}.metrics"),
              Suffix = new List<string>(){".log", ".metrics"}
            };
            var lastReadTokenFile = Path.Combine(teleConfig.LogsPath, "lastToken.json");
            string prefix = portingAssistantPortingConfiguration.PortingAssistantMetrics["Prefix"].ToString();
            var client = new HttpClient();

            // Create a timer and set an interval.
            var logTimer = new System.Timers.Timer();
            logTimer.Interval = Convert.ToDouble(portingAssistantPortingConfiguration.PortingAssistantMetrics["LogTimerInterval"].ToString());
            // Hook up the Elapsed event for the timer. 
            // logTimer.Elapsed += OnTimedEvent;
            logTimer.Elapsed += (source, e) => LogUploadUtils.OnTimedEvent(source, e, teleConfig, lastReadTokenFile, client, profile, prefix);
            
            // Have the timer fire repeated events (true is the default)
            logTimer.AutoReset = true;

            // Start the timer
            logTimer.Enabled = true;

            _connection.Listen();
        }

      private class PortingAssistantPortingConfiguration
        {
            public PortingAssistantConfiguration PortingAssistantConfiguration { get; set; }
            public Dictionary<string, object> PortingAssistantMetrics { get; set; }
        }
    }
}
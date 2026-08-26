using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

internal static class Program
{
    private const string LocalUrl = "http://127.0.0.1:5174";
    private const string HealthUrl = LocalUrl + "/api/health";

    [STAThread]
    private static int Main()
    {
        try
        {
            var root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');
            var distEntry = Path.Combine(root, "dist", "index.html");
            var serverEntry = Path.Combine(root, "server", "local-server.mjs");

            if (!File.Exists(distEntry))
            {
                ShowError("找不到 dist/index.html。\n请确认已完整解压，或在开发目录先执行 npm run build。");
                return 1;
            }

            if (!File.Exists(serverEntry))
            {
                ShowError("找不到 server/local-server.mjs。");
                return 1;
            }

            var nodeExe = ResolveNodeExecutable(root);
            if (nodeExe == null)
            {
                ShowError("找不到 Node.js 运行时。\n请确认 node/node.exe 存在，或已安装 Node.js 22+。");
                return 1;
            }

            // Always take over port 5174 from this package. A healthy old process
            // (hidden, no tray UI) would otherwise keep serving stale code forever.
            StopListener();
            StartServer(nodeExe, root);

            if (!WaitForHealth(30))
            {
                ShowError("本地服务未能在 5174 端口启动。\n请检查端口是否被其他程序占用。");
                return 1;
            }

            OpenBrowser();
            return 0;
        }
        catch (Exception ex)
        {
            ShowError(ex.Message);
            return 1;
        }
    }

    private static string ResolveNodeExecutable(string root)
    {
        var bundled = Path.Combine(root, "node", "node.exe");
        if (File.Exists(bundled)) return bundled;

        var pathEnv = Environment.GetEnvironmentVariable("PATH") ?? string.Empty;
        foreach (var folder in pathEnv.Split(';'))
        {
            if (string.IsNullOrWhiteSpace(folder)) continue;
            var trimmed = folder.Trim();
            var full = Path.Combine(trimmed, "node.exe");
            if (File.Exists(full)) return full;
            full = Path.Combine(trimmed, "node");
            if (File.Exists(full)) return full;
        }

        return null;
    }

    private static bool IsHealthy()
    {
        try
        {
            var request = (HttpWebRequest)WebRequest.Create(HealthUrl);
            request.Timeout = 2000;
            request.Method = "GET";
            using (var response = (HttpWebResponse)request.GetResponse())
            using (var stream = response.GetResponseStream())
            using (var reader = new StreamReader(stream))
            {
                var json = reader.ReadToEnd();
                return json.Contains("\"ok\":true") || json.Contains("\"ok\": true");
            }
        }
        catch
        {
            return false;
        }
    }

    private static bool WaitForHealth(int attempts)
    {
        for (var i = 0; i < attempts; i += 1)
        {
            Thread.Sleep(500);
            if (IsHealthy()) return true;
        }
        return false;
    }

    private static void StartServer(string nodeExe, string root)
    {
        var startInfo = new ProcessStartInfo();
        startInfo.FileName = nodeExe;
        startInfo.Arguments = "server/local-server.mjs";
        startInfo.WorkingDirectory = root;
        startInfo.CreateNoWindow = true;
        startInfo.UseShellExecute = false;
        startInfo.WindowStyle = ProcessWindowStyle.Hidden;
        Process.Start(startInfo);
    }

    private static void StopListener()
    {
        var startInfo = new ProcessStartInfo();
        startInfo.FileName = "powershell.exe";
        startInfo.Arguments = "-NoProfile -ExecutionPolicy Bypass -Command \"Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 5174 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }\"";
        startInfo.CreateNoWindow = true;
        startInfo.UseShellExecute = false;
        startInfo.WindowStyle = ProcessWindowStyle.Hidden;
        var process = Process.Start(startInfo);
        if (process != null)
        {
            process.WaitForExit(8000);
        }
    }

    private static void OpenBrowser()
    {
        var startInfo = new ProcessStartInfo();
        startInfo.FileName = LocalUrl;
        startInfo.UseShellExecute = true;
        Process.Start(startInfo);
    }

    private static void ShowError(string message)
    {
        MessageBox.Show(message, "Worthward", MessageBoxButtons.OK, MessageBoxIcon.Error);
    }
}

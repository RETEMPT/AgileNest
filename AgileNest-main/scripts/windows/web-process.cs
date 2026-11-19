using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

public sealed class AgileNestWebJob : IDisposable
{
    private IntPtr job;

    public AgileNestWebJob()
    {
        job = CreateJobObject(IntPtr.Zero, null);
        if (job == IntPtr.Zero) throw new Win32Exception();
        var limits = new ExtendedLimits();
        limits.Basic.Flags = 0x2000; // Windows closes this handle even when the launcher is forcibly closed.
        if (!SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(limits)))
        {
            var error = new Win32Exception();
            Dispose();
            throw error;
        }
    }

    public Process Start(string executable, string arguments, string directory, string output, string error)
    {
        var startup = new StartupInfo();
        startup.Size = Marshal.SizeOf(startup);
        var process = new ProcessInfo();
        SafeFileHandle inputHandle = null, outputHandle = null, errorHandle = null;
        bool redirected = !String.IsNullOrEmpty(output);
        try
        {
            if (redirected)
            {
                var security = new SecurityAttributes();
                security.Size = Marshal.SizeOf(security);
                security.Inherit = true;
                inputHandle = OpenFile("NUL", 0x80000000, 3, ref security);
                outputHandle = OpenFile(output, 0x40000000, 2, ref security);
                errorHandle = OpenFile(error, 0x40000000, 2, ref security);
                startup.Flags = 0x100;
                startup.Input = inputHandle.DangerousGetHandle();
                startup.Output = outputHandle.DangerousGetHandle();
                startup.Error = errorHandle.DangerousGetHandle();
            }
            // Assign before resuming so Next.js workers belong to the same lifetime.
            uint flags = 4 | (redirected ? 0x08000000u : 0u);
            if (!CreateProcess(executable, new StringBuilder("\"" + executable + "\" " + arguments),
                IntPtr.Zero, IntPtr.Zero, redirected, flags, IntPtr.Zero, directory, ref startup, out process))
                throw new Win32Exception();
            if (!AssignProcessToJobObject(job, process.Process)) throw new Win32Exception();
            var managed = Process.GetProcessById((int)process.Id);
            if (ResumeThread(process.Thread) == uint.MaxValue) throw new Win32Exception();
            return managed;
        }
        catch
        {
            if (process.Process != IntPtr.Zero) TerminateProcess(process.Process, 1);
            throw;
        }
        finally
        {
            if (process.Thread != IntPtr.Zero) CloseHandle(process.Thread);
            if (process.Process != IntPtr.Zero) CloseHandle(process.Process);
            if (inputHandle != null) inputHandle.Dispose();
            if (outputHandle != null) outputHandle.Dispose();
            if (errorHandle != null) errorHandle.Dispose();
        }
    }

    public void Dispose()
    {
        if (job != IntPtr.Zero) { CloseHandle(job); job = IntPtr.Zero; }
    }

    private static SafeFileHandle OpenFile(string path, uint access, uint disposition, ref SecurityAttributes security)
    {
        var handle = CreateFile(path, access, 3, ref security, disposition, 0x80, IntPtr.Zero);
        if (handle.IsInvalid) { handle.Dispose(); throw new Win32Exception(); }
        return handle;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct BasicLimits
    {
        public long ProcessTime, JobTime;
        public uint Flags;
        public UIntPtr MinWorkingSet, MaxWorkingSet;
        public uint ActiveProcesses;
        public UIntPtr Affinity;
        public uint Priority, Scheduling;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct IoCounters { public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes; }
    [StructLayout(LayoutKind.Sequential)]
    private struct ExtendedLimits
    {
        public BasicLimits Basic;
        public IoCounters Io;
        public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct StartupInfo
    {
        public int Size;
        public string Reserved, Desktop, Title;
        public uint X, Y, Width, Height, BufferWidth, BufferHeight, Fill, Flags;
        public ushort Show, ReservedSize;
        public IntPtr ReservedPointer, Input, Output, Error;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct ProcessInfo { public IntPtr Process, Thread; public uint Id, ThreadId; }
    [StructLayout(LayoutKind.Sequential)]
    private struct SecurityAttributes { public int Size; public IntPtr Descriptor; [MarshalAs(UnmanagedType.Bool)] public bool Inherit; }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(IntPtr job, int kind, ref ExtendedLimits info, uint size);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", EntryPoint = "CreateProcessW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateProcess(string executable, StringBuilder command, IntPtr processSecurity, IntPtr threadSecurity,
        bool inherit, uint flags, IntPtr environment, string directory, ref StartupInfo startup, out ProcessInfo process);
    [DllImport("kernel32.dll", EntryPoint = "CreateFileW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFile(string path, uint access, uint share, ref SecurityAttributes security,
        uint disposition, uint flags, IntPtr template);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);
}

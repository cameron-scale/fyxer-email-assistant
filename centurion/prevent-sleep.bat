@echo off
REM Keep the PC awake while you're away (so Centurion + tunnel keep running).
REM Disables sleep/hibernate/disk-sleep on AC power. Re-enable later with
REM Windows Settings, or: powercfg /change standby-timeout-ac 30
echo Disabling sleep/hibernate on AC power...
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /change disk-timeout-ac 0
powercfg /change monitor-timeout-ac 0
echo Done. This PC will stay awake on AC power.
echo (Tip: also disable automatic restart for Windows Updates while away,
echo  or enable auto-login so it comes back up after a forced reboot.)
pause

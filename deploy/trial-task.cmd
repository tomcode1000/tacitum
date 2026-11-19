@echo off
rem Privacy trial, run by Windows Task Scheduler twice a day (TacitumTrialAM / TacitumTrialPM).
cd /d "C:\Users\Toleexxzy\OneDrive\Documents\coding projects\tacitum"
echo ==== %DATE% %TIME% >> data\trials\trial.log
"C:\Program Files\nodejs\node.exe" scripts\trial.mjs >> data\trials\trial.log 2>&1

@echo off
title KubeChat - Stop AWS Server
color 0C

echo.
echo  ========================================
echo   KubeChat - STOPPING AWS Server
echo  ========================================
echo.
echo  Step 1: Stopping Docker containers on EC2...
echo  (SSH into your EC2 and run these commands)
echo.
echo  Open your EC2 terminal and paste:
echo.
echo  sudo docker compose -f /opt/kubechat/docker-compose.prod.yml down
echo.
echo  Step 2: Stopping EC2 instance via AWS Console
echo  Opening AWS Console now...
echo.
start "" "https://us-east-1.console.aws.amazon.com/ec2/home?region=us-east-1#Instances"
echo.
echo  In the AWS Console:
echo  1. Select your instance (kubechat-server)
echo  2. Click "Instance State"
echo  3. Click "Stop Instance"
echo  4. Click "Stop" to confirm
echo.
echo  WARNING: Your IP will CHANGE when you restart!
echo  You will need to update the Flutter app with the new IP.
echo.
pause

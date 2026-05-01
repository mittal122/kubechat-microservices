@echo off
title KubeChat - Start AWS Server
color 0A

echo.
echo  ========================================
echo   KubeChat - STARTING AWS Server
echo  ========================================
echo.
echo  Step 1: Starting EC2 instance...
echo  Opening AWS Console now...
echo.
start "" "https://us-east-1.console.aws.amazon.com/ec2/home?region=us-east-1#Instances"
echo.
echo  In the AWS Console:
echo  1. Select your instance (kubechat-server)
echo  2. Click "Instance State"
echo  3. Click "Start Instance"
echo  4. Wait 1-2 minutes for it to fully start
echo  5. Copy the NEW Public IPv4 address (it changes every restart!)
echo.
echo  Step 2: SSH into EC2 and start Docker services
echo  Use EC2 Instance Connect in the browser, then paste:
echo.
echo  sudo docker compose -f /opt/kubechat/docker-compose.prod.yml up -d
echo.
echo  Step 3: Get the new IP from AWS Console
echo  - Click your instance
echo  - Copy "Public IPv4 address"
echo  - Your new server URL = http://NEW_IP:5000
echo.
echo  Step 4: Test the server
echo  Open browser: http://NEW_IP:5000/health
echo.
echo  ========================================
echo   IMPORTANT - UPDATE FLUTTER APP WITH NEW IP
echo  ========================================
echo  If the IP changed, rebuild the APK with the new IP.
echo  See: flutter_chat_app\lib\config\api_config.dart
echo  Change _productionUrl to: http://NEW_IP:5000
echo  Then rebuild: flutter build apk --release --dart-define=ENV=production
echo.
pause

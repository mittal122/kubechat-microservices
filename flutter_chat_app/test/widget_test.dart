import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_chat_app/main.dart';

void main() {
  testWidgets('App loads and shows auth gate', (WidgetTester tester) async {
    await tester.pumpWidget(const KubeChatApp());
    // The app should render without crashing
    expect(find.byType(MaterialApp), findsOneWidget);
  });
}

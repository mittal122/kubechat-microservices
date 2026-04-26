/// Data model for a User.
/// Maps to the backend's User mongoose model.
class UserModel {
  final String id;
  final String name;
  final String email;
  final String? connectCode;
  final String? createdAt;

  UserModel({
    required this.id,
    required this.name,
    required this.email,
    this.connectCode,
    this.createdAt,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: json['_id'] as String,
      name: json['name'] as String,
      email: json['email'] as String,
      connectCode: json['connectCode'] as String?,
      createdAt: json['createdAt'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        '_id': id,
        'name': name,
        'email': email,
        'connectCode': connectCode,
        'createdAt': createdAt,
      };
}

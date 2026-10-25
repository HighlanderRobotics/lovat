class CustomPostMatchAnswer {
  const CustomPostMatchAnswer({required this.question, required this.answer});

  final String question;
  final String answer;

  factory CustomPostMatchAnswer.fromJson(Map<String, dynamic> json) =>
      CustomPostMatchAnswer(
        question: json['question'] as String,
        answer: json['answer'] as String,
      );

  static List<CustomPostMatchAnswer> parseList(dynamic value) {
    if (value == null) return const [];
    return (value as List<dynamic>)
        .map((item) => CustomPostMatchAnswer.fromJson(
            Map<String, dynamic>.from(item as Map)))
        .toList();
  }
}

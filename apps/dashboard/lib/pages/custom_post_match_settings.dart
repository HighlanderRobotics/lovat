import 'package:flutter/material.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/custom_post_match.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';
import 'package:scouting_dashboard_app/reusable/scrollable_page_body.dart';

class CustomPostMatchSettingsPage extends StatefulWidget {
  const CustomPostMatchSettingsPage(
      {super.key, this.loadQuestions, this.saveQuestions});
  final Future<List<String>> Function()? loadQuestions;
  final Future<void> Function(List<String>)? saveQuestions;

  @override
  State<CustomPostMatchSettingsPage> createState() =>
      _CustomPostMatchSettingsPageState();
}

class _CustomPostMatchSettingsPageState
    extends State<CustomPostMatchSettingsPage> {
  final _controllers = List.generate(3, (_) => TextEditingController());
  bool _loading = true;
  bool _loaded = false;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final questions = await (widget.loadQuestions ??
          lovatAPI.getCustomPostMatchQuestions)();
      if (!mounted) return;
      for (var i = 0; i < _controllers.length; i++) {
        _controllers[i].text = i < questions.length ? questions[i] : '';
      }
      setState(() {
        _loading = false;
        _loaded = true;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = 'Could not load custom questions.';
        });
      }
    }
  }

  Future<void> _save() async {
    if (!_loaded) return;
    final questions = _controllers
        .map((c) => c.text.trim())
        .where((q) => q.isNotEmpty)
        .toList();
    if (questions.toSet().length != questions.length) {
      setState(() => _error = 'Each question must be different.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await (widget.saveQuestions ??
          lovatAPI.setCustomPostMatchQuestions)(questions);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Custom questions saved')));
      Navigator.of(context).pop();
    } on LovatAPIException catch (e) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = e.message;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = 'Could not save custom questions.';
        });
      }
    }
  }

  @override
  void dispose() {
    for (final controller in _controllers) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Custom post-match questions')),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : ScrollablePageBody(children: [
                const Text(
                    'Add up to 3 free-text questions for your team. Leave a field empty to remove it. Changes apply to new matches after Collection refreshes.'),
                const SizedBox(height: 16),
                for (var i = 0; i < 3; i++) ...[
                  TextField(
                      controller: _controllers[i],
                      enabled: _loaded && !_saving,
                      maxLength: 300,
                      minLines: 1,
                      maxLines: 4,
                      decoration: InputDecoration(
                          labelText: 'Question ${i + 1}', filled: true)),
                  const SizedBox(height: 12),
                ],
                if (_error != null) ...[
                  Text(_error!,
                      style: TextStyle(
                          color: Theme.of(context).colorScheme.error)),
                  const SizedBox(height: 12),
                ],
                FilledButton(
                    onPressed: !_loaded || _saving ? null : _save,
                    child: Text(_saving ? 'Saving…' : 'Save questions')),
                if (_error != null)
                  TextButton(
                      onPressed: _saving ? null : _load,
                      child: const Text('Reload questions')),
              ]),
      );
}

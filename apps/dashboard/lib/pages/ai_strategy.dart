import 'dart:async';
import 'package:apple_strategy/apple_strategy.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:scouting_dashboard_app/datatypes.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/ai_strategy.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';
import 'package:scouting_dashboard_app/reusable/navigation_drawer.dart';
import 'package:scouting_dashboard_app/reusable/scrollable_page_body.dart';
import 'package:scouting_dashboard_app/reusable/tournament_key_picker.dart';

enum StrategyEngine { apple, claude }

class AiStrategyPage extends StatefulWidget {
  const AiStrategyPage(
      {super.key, this.api, this.localModel = const AppleStrategyModel()});
  final LovatAPI? api;
  final AppleStrategyModel localModel;

  @override
  State<AiStrategyPage> createState() => _AiStrategyPageState();
}

class _AiStrategyPageState extends State<AiStrategyPage> {
  final _briefing = TextEditingController();
  Tournament? _tournament;
  StrategyContext? _context;
  String? _error;
  bool _example = false;
  StrategyEngine _engine = StrategyEngine.claude;
  AppleStrategyAvailability? _localAvailability;
  bool _loading = false;
  bool _generating = false;
  bool _briefingChanged = false;
  int _request = 0;
  LovatAPI get _api => widget.api ?? lovatAPI;

  @override
  void initState() {
    super.initState();
    _checkLocalModel();
    Tournament.getCurrent().then((tournament) {
      if (mounted && _request == 0) _selectTournament(tournament);
    });
  }

  Future<void> _checkLocalModel() async {
    final status = await widget.localModel.availability();
    if (!mounted) return;
    setState(() {
      if (_localAvailability == null && status.available && !_generating) {
        _engine = StrategyEngine.apple;
      }
      _localAvailability = status;
    });
  }

  @override
  void dispose() {
    if (_generating && _engine == StrategyEngine.apple) {
      unawaited(widget.localModel.cancel());
    }
    _briefing.dispose();
    super.dispose();
  }

  Future<void> _selectTournament(Tournament? tournament,
      {bool example = false}) async {
    if (_generating && _engine == StrategyEngine.apple) {
      unawaited(widget.localModel.cancel());
    }
    final request = ++_request;
    setState(() {
      _tournament = tournament;
      _example = example;
      _context = null;
      _error = null;
      _loading = tournament != null;
      _generating = false;
    });
    if (tournament == null) return;
    try {
      final data = await _api.getStrategyContext(tournament.key,
          example: example, local: true);
      if (!mounted || request != _request) return;
      setState(() => _context = data);
    } catch (error) {
      if (!mounted || request != _request) return;
      setState(() => _error = _message(error));
    } finally {
      if (mounted && request == _request) {
        setState(() => _loading = false);
      }
    }
  }

  String _message(Object error) => error is LovatAPIException
      ? error.message
      : error is PlatformException
          ? error.message ?? 'The on-device model is unavailable.'
          : 'Could not reach the strategy service. Please retry.';

  Future<void> _generate() async {
    final tournament = _tournament;
    final data = _context;
    if (tournament == null || data == null || _generating) return;
    final request = ++_request;
    setState(() {
      _generating = true;
      _error = null;
    });
    try {
      final StrategyContext result;
      if (_engine == StrategyEngine.apple) {
        final prompt = data.localPrompt;
        if (prompt == null) {
          throw const LovatAPIException(
              'Refresh match and data to prepare on-device generation.');
        }
        final draft = await widget.localModel
            .generate(prompt: prompt, briefing: _briefing.text.trim());
        result = data.withDraft(_example
            ? 'EXAMPLE ONLY — hypothetical match and synthetic scouting, not actual event results.\n\n$draft'
            : draft);
      } else {
        result = await _api.draftStrategy(tournament.key,
            matchKey: data.matchKey,
            briefing: _briefing.text.trim(),
            example: _example);
      }
      if (!mounted || request != _request) return;
      setState(() {
        _context = result;
        _briefingChanged = false;
      });
    } catch (error) {
      if (!mounted || request != _request) return;
      setState(() => _error = _message(error));
    } finally {
      if (mounted && request == _request) {
        setState(() => _generating = false);
      }
    }
  }

  Widget _alliance(String alliance) {
    final teams = _context!.teams.where((team) => team.alliance == alliance);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${alliance == 'RED' ? 'Red' : 'Blue'} alliance',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            for (final team in teams)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Text(
                    '${team.number}${team.name == null ? '' : ' · ${team.name}'}${team.number == _context!.teamNumber ? (_example ? ' · Example team' : ' · Your team') : ''} — ${team.reportCount == 0 ? 'No reports' : '${team.reportCount} reports'}'),
              ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final data = _context;
    return Scaffold(
      appBar: AppBar(title: const Text('AI Strategy Assistant')),
      drawer: const GlobalNavigationDrawer(),
      body: ScrollablePageBody(children: [
        Row(
          children: [
            Expanded(
              child: Text('Plan your next match',
                  style: Theme.of(context).textTheme.headlineMedium),
            ),
            const SizedBox(width: 16),
            Image.asset(
              'assets/images/ai_strategy_mascot.png',
              width: 104,
              height: 104,
              fit: BoxFit.contain,
              excludeFromSemantics: true,
            ),
          ],
        ),
        const SizedBox(height: 8),
        const Text(
            'Choose the tournament you are at. Build a strategy from your team, alliance partners, opponents, and scouting collected at that event.'),
        const SizedBox(height: 24),
        DropdownButtonFormField<StrategyEngine>(
          key: ValueKey(_engine),
          isExpanded: true,
          initialValue: _engine,
          decoration: const InputDecoration(
              labelText: 'Strategy model', border: OutlineInputBorder()),
          items: [
            DropdownMenuItem(
                value: StrategyEngine.apple,
                enabled: _localAvailability?.available == true,
                child: const Text('Apple Intelligence · On device')),
            const DropdownMenuItem(
                value: StrategyEngine.claude,
                child: Text('Claude · Cloud API')),
          ],
          onChanged: _loading || _generating
              ? null
              : (engine) {
                  if (engine == null) return;
                  setState(() {
                    _engine = engine;
                    _briefingChanged = true;
                  });
                },
        ),
        const SizedBox(height: 8),
        Text(_localAvailability?.message ??
            'Checking Apple Intelligence availability…'),
        if (_localAvailability?.available == false)
          Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                  onPressed: _checkLocalModel,
                  child: const Text('Check Apple Intelligence again'))),
        const SizedBox(height: 16),
        if (_example) ...[
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('NorCal Championship · REBUILT example',
                        style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 8),
                    const Text(
                        'Hypothetical match: 8033, 1323 MadTown Robotics, and 4414 HighTide versus 254, 1678, and 971. All scouting observations and alliance assignments are synthetic, not actual event results.'),
                    TextButton(
                        onPressed: () async {
                          final tournament = await Tournament.getCurrent();
                          if (mounted) _selectTournament(tournament);
                        },
                        child: const Text('Use my tournament data')),
                  ]),
            ),
          ),
        ] else ...[
          OutlinedButton.icon(
            onPressed: () => _selectTournament(
                Tournament(
                    '2026norcaldemo', 'NorCal Championship · REBUILT example'),
                example: true),
            icon: const Icon(Icons.science_outlined),
            label: const Text('Try NorCal REBUILT example'),
          ),
          const SizedBox(height: 16),
          TournamentKeyPicker(
            decoration: const InputDecoration(
                labelText: 'Tournament',
                filled: true,
                prefixIcon: Icon(Icons.location_on_outlined)),
            onChanged: _selectTournament,
          ),
        ],
        const SizedBox(height: 12),
        if (!_example)
          const Text(
              'Uses only this tournament and your saved data-source settings. Up to 20 recent reports per team from completed matches; training and practice reports are excluded.'),
        const SizedBox(height: 16),
        if (_loading) ...[
          const LinearProgressIndicator(),
          const SizedBox(height: 12),
          const Text('Finding your next match and scouting data…'),
        ],
        if (_tournament == null)
          const Text('Select a tournament to find your team’s next match.'),
        if (_error != null) ...[
          Card(
            color: Theme.of(context).colorScheme.errorContainer,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Text(_error!,
                  style: TextStyle(
                      color: Theme.of(context).colorScheme.onErrorContainer)),
            ),
          ),
        ],
        if (_tournament != null && !_loading)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: _generating
                  ? null
                  : () => _selectTournament(_tournament, example: _example),
              icon: const Icon(Icons.refresh),
              label: const Text('Refresh match and data'),
            ),
          ),
        if (data != null) ...[
          const SizedBox(height: 16),
          Text(
              '${_example ? 'Example match' : 'Next match'} · ${data.matchKey}',
              style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          Text(
              'Team ${data.teamNumber} · ${data.reportCount} ${_example ? 'sample' : 'sourced'} reports'),
          LayoutBuilder(builder: (context, constraints) {
            if (constraints.maxWidth < 520) {
              return Column(children: [_alliance('RED'), _alliance('BLUE')]);
            }
            return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(child: _alliance('RED')),
              Expanded(child: _alliance('BLUE')),
            ]);
          }),
          if (data.teams.any((team) => team.reportCount == 0))
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Text(
                  'Some teams have no sourced reports. Their capabilities will be treated as unknown.'),
            ),
          const SizedBox(height: 16),
          TextField(
            controller: _briefing,
            enabled: !_generating,
            minLines: 3,
            maxLines: 6,
            maxLength: _engine == StrategyEngine.apple ? 800 : 2000,
            onChanged: (_) {
              // A previous draft no longer reflects the edited team briefing.
              setState(() => _briefingChanged = true);
            },
            decoration: const InputDecoration(
              labelText: 'Your team’s match briefing (optional)',
              hintText:
                  'Robot limitations, preferred role, autonomous plans, or drive-team priorities',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          Text(_engine == StrategyEngine.apple
              ? 'Generates on this device from the loaded match snapshot, using ratings and recent notes. Refresh before each match. Once the data is loaded, generation works offline and makes no Claude request. Review the draft with your drive team.'
              : 'Generating sends the sourced scouting summaries, notes, and your briefing to Claude to draft a plan. Review it with your drive team.'),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: _generating ||
                    data.reportCount == 0 ||
                    (_engine == StrategyEngine.apple &&
                        (_localAvailability?.available != true ||
                            _briefing.text.length > 800))
                ? null
                : _generate,
            icon: const Icon(Icons.auto_awesome),
            label: Text(_generating
                ? 'Drafting strategy…'
                : 'Draft next-match strategy'),
          ),
          if (data.reportCount == 0)
            const Padding(
              padding: EdgeInsets.only(top: 12),
              child: Text(
                  'Collect reports or update your data-source settings before drafting.'),
            ),
          if (_generating)
            const Padding(
                padding: EdgeInsets.only(top: 16),
                child: LinearProgressIndicator()),
          if (data.draft != null && !_briefingChanged) ...[
            const SizedBox(height: 24),
            Text(_example ? 'Example strategy draft' : 'Strategy draft',
                style: Theme.of(context).textTheme.titleLarge),
            Text(
                '${_engine == StrategyEngine.apple ? 'Generated on device · ' : ''}Data collected ${data.collectedAt.toLocal()}'),
            const SizedBox(height: 12),
            Card(
                child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: SelectableText(data.draft!))),
            Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                    onPressed: () async {
                      await Clipboard.setData(ClipboardData(text: data.draft!));
                      if (!context.mounted) return;
                      ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Strategy copied')));
                    },
                    icon: const Icon(Icons.copy),
                    label: const Text('Copy strategy'))),
          ],
        ],
      ]),
    );
  }
}

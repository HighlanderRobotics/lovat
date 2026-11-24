# frozen_string_literal: true

require 'yaml'

root = File.expand_path('..', __dir__)
errors = []
workflows = Dir.glob(File.join(root, '.github/workflows/*.{yml,yaml}')).to_h do |path|
  [File.basename(path), YAML.safe_load_file(path, aliases: true)]
end
files = workflows.dup
Dir.glob(File.join(root, '.github/actions/**/action.{yml,yaml}')).each do |path|
  files[path.delete_prefix(root + '/')] = YAML.safe_load_file(path, aliases: true)
end

files.each do |file, document|
  jobs = document.fetch('jobs', {}).values
  steps = jobs.flat_map { |job| job.fetch('steps', []) }
  steps.concat(document.fetch('runs', {}).fetch('steps', []))
  (jobs + steps).filter_map { |item| item['uses'] }.each do |reference|
    next if reference.start_with?('./')
    next if reference.match?(%r{\A[\w.-]+/[\w./-]+@[0-9a-f]{40}\z})

    errors << "#{file}: pin #{reference} to a full commit SHA"
  end
end

def workflow_events(workflow)
  # Psych resolves the YAML 1.1 key "on" to true.
  events = workflow.fetch('on') { workflow.fetch(true) }
  events.is_a?(Hash) ? events.keys : Array(events)
end

trusted_jobs = {
  'ai-review.yml' => {
    name: 'review',
    events: %w[pull_request],
    ref: '${{ github.event.pull_request.base.sha }}',
    condition: '${{ github.event.pull_request.head.repo.full_name == github.repository }}',
    permissions: { 'contents' => 'read', 'pull-requests' => 'write' }
  },
  'server-railway-qr-codes.yml' => {
    name: 'post-qr-codes',
    events: %w[issue_comment pull_request_target],
    ref: '${{ github.event.repository.default_branch }}',
    condition: <<~CONDITION.split.join(' '),
      (github.event_name == 'pull_request_target' &&
       github.event.pull_request.head.repo.full_name == github.repository) ||
      (github.event.issue.pull_request &&
       github.event.comment.user.login == 'railway-app[bot]' &&
       contains(github.event.comment.body, 'railway-bot-comment-version'))
    CONDITION
    permissions: { 'contents' => 'read', 'pull-requests' => 'write', 'issues' => 'write' }
  }
}

trusted_jobs.each do |file, policy|
  workflow = workflows.fetch(file)
  jobs = workflow.fetch('jobs')
  job = jobs.fetch(policy.fetch(:name))
  unless jobs.keys == [policy.fetch(:name)] &&
         workflow_events(workflow).sort == policy.fetch(:events) &&
         workflow.fetch('permissions') == { 'contents' => 'read' } &&
         job.fetch('permissions') == policy.fetch(:permissions) &&
         job.fetch('if').split.join(' ') == policy.fetch(:condition)
    errors << "#{file}: privileged job, triggers, eligibility or permissions changed"
  end

  steps = job.fetch('steps')
  checkouts = steps.select { |step| step.fetch('uses', '').start_with?('actions/checkout@') }
  unless checkouts.size == 1 &&
         checkouts.first.fetch('with').fetch('ref') == policy.fetch(:ref) &&
         checkouts.first.fetch('with').fetch('persist-credentials') == false &&
         !checkouts.first.fetch('with').key?('repository')
    errors << "#{file}: privileged jobs must check out trusted code without persisting credentials"
  end
  if steps.any? { |step| step.fetch('run', '').match?(/\$\{\{[^}]*github\.event\b/m) }
    errors << "#{file}: keep event data out of inline shell expressions"
  end
end

pages_file = 'test-reports-pages.yml'
pages = workflows.fetch(pages_file)
pages_jobs = pages.fetch('jobs')
qualify = pages_jobs.fetch('qualify')
publish = pages_jobs.fetch('publish')
pages_conditions = <<~CONDITION.split.join(' ')
  vars.TEST_REPORT_PAGES_ENABLED == 'true' &&
  github.event.workflow_run.event == 'push' &&
  github.event.workflow_run.conclusion == 'success' &&
  github.event.workflow_run.head_branch == 'main' &&
  github.event.workflow_run.path == '.github/workflows/ci.yml' &&
  github.event.workflow_run.head_repository.id == github.event.repository.id
CONDITION
pages_trigger = pages.fetch('on') { pages.fetch(true) }
unless pages_trigger == { 'workflow_run' => { 'workflows' => ['CI'], 'types' => ['completed'], 'branches' => ['main'] } } &&
       pages.fetch('permissions') == { 'contents' => 'read' } &&
       pages_jobs.keys == %w[qualify publish] &&
       !qualify.key?('permissions') &&
       qualify.fetch('if').split.join(' ') == pages_conditions &&
       publish.fetch('needs') == 'qualify' &&
       publish.fetch('if') == "${{ needs.qualify.outputs.current == 'true' }}" &&
       publish.fetch('permissions') == { 'contents' => 'read', 'actions' => 'read', 'pages' => 'write', 'id-token' => 'write' }
  errors << "#{pages_file}: allow Pages writes only after successful same-repo main CI"
end

publish_steps = publish.fetch('steps')
checkouts = publish_steps.select { |step| step.fetch('uses', '').start_with?('actions/checkout@') }
downloads = publish_steps.select { |step| step.fetch('uses', '').start_with?('actions/download-artifact@') }
deployments = publish_steps.select { |step| step.fetch('uses', '').start_with?('actions/deploy-pages@') }
unless checkouts.map { |step| step.fetch('with') } == [
  { 'ref' => '${{ github.event.workflow_run.head_sha }}', 'persist-credentials' => false }
] && downloads.map { |step| step.fetch('with') } == [
  {
    'run-id' => '${{ github.event.workflow_run.id }}',
    'github-token' => '${{ github.token }}',
    'path' => '${{ runner.temp }}/downloaded-test-reports',
    'pattern' => '*-report'
  }
] && deployments.map { |step| step.fetch('if') } == ["${{ steps.deploy-source.outputs.current == 'true' }}"]
  errors << "#{pages_file}: publish only the exact triggering CI artifacts using trusted code and current source"
end
if pages_jobs.values.flat_map { |job| job.fetch('steps') }.any? { |step| step.fetch('run', '').match?(/\$\{\{[^}]*github\.event\b/m) }
  errors << "#{pages_file}: keep event data out of inline shell expressions"
end
if workflows.fetch('ci.yml').fetch('jobs').values.any? { |job| job.fetch('permissions', {})['pages'] == 'write' }
  errors << 'ci.yml: publish Pages only outside the tested-commit CI workflow'
end

workflows.each do |file, workflow|
  privileged_events = workflow_events(workflow) & %w[pull_request_target issue_comment workflow_run]
  next if privileged_events.empty? || trusted_jobs.key?(file) || file == pages_file

  errors << "#{file}: review the privilege policy before adding #{privileged_events.join(', ')}"
end

abort errors.join("\n") unless errors.empty?

puts "Workflow pin and privilege policy passed (#{files.size} files)."

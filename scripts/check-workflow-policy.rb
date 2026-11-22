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

workflows.each do |file, workflow|
  privileged_events = workflow_events(workflow) & %w[pull_request_target issue_comment workflow_run]
  next if privileged_events.empty? || trusted_jobs.key?(file)

  errors << "#{file}: review the privilege policy before adding #{privileged_events.join(', ')}"
end

abort errors.join("\n") unless errors.empty?

puts "Workflow pin and privilege policy passed (#{files.size} files)."

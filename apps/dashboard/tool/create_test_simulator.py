"""Create a disposable simulator using an installed, compatible device/runtime pair."""
import json
import subprocess


def compatible_pair(data):
    available = {
        runtime['identifier']
        for runtime in data['runtimes']
        if runtime.get('isAvailable')
        and runtime['identifier'].startswith('com.apple.CoreSimulator.SimRuntime.iOS-')
    }
    types = {device['name']: device['identifier'] for device in data['devicetypes']}
    for runtime, devices in data['devices'].items():
        if runtime not in available:
            continue
        for device in devices:
            if device.get('isAvailable') and device['name'].startswith('iPhone'):
                device_type = device.get('deviceTypeIdentifier') or types.get(device['name'])
                if device_type:
                    return device_type, runtime
    raise ValueError('No installed compatible iPhone simulator/runtime pair')


if __name__ == '__main__':
    data = json.loads(subprocess.check_output(['xcrun', 'simctl', 'list', '--json']))
    device_type, runtime = compatible_pair(data)
    print(subprocess.check_output([
        'xcrun', 'simctl', 'create', 'lovat-dashboard-ci', device_type, runtime,
    ], text=True).strip())

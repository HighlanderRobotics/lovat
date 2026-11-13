import unittest
from create_test_simulator import compatible_pair


class CompatibleSimulatorTests(unittest.TestCase):
    def test_uses_installed_pair_instead_of_first_unrelated_device_type(self):
        runtime = 'com.apple.CoreSimulator.SimRuntime.iOS-18-5'
        data = {
            'runtimes': [{'identifier': runtime, 'isAvailable': True}],
            'devicetypes': [
                {'name': 'iPhone 17 Pro', 'identifier': 'incompatible'},
                {'name': 'iPhone 16', 'identifier': 'compatible'},
            ],
            'devices': {runtime: [
                {'name': 'iPhone 16', 'isAvailable': True},
            ]},
        }
        self.assertEqual(compatible_pair(data), ('compatible', runtime))
        data['runtimes'][0]['isAvailable'] = False
        with self.assertRaisesRegex(ValueError, 'No installed compatible'):
            compatible_pair(data)


if __name__ == '__main__':
    unittest.main()

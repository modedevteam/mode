/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getInstanceId } from '../licensing/instanceManager';
import { LICENSE_MESSAGES } from '../../common/user-messages/messages';

export class LicenseManager {
    private static readonly LICENSE_KEY_ID_PAIR = 'mode.licenseKeyIdPair';
    private readonly context: vscode.ExtensionContext;
    private readonly storeUrl = 'https://app.lemonsqueezy.com/my-orders/80ee7256-4c6e-4106-a6a6-c7a689e81ab9';
    private readonly validationUrl = 'https://api.lemonsqueezy.com/v1/licenses/validate';
    private readonly activationUrl = 'https://api.lemonsqueezy.com/v1/licenses/activate';
    private readonly deactivationUrl = 'https://api.lemonsqueezy.com/v1/licenses/deactivate';

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    public async handleLicense(): Promise<boolean> {

		// check if the license is valid
		const licenseIdPair = this.context.globalState.get<string>(LicenseManager.LICENSE_KEY_ID_PAIR);
		let isLicenseValid = false;
		if (licenseIdPair) {
			const [licenseKey, instanceId] = licenseIdPair.split(':');
			isLicenseValid = await this.validate(licenseKey, instanceId);
            isLicenseValid = await this.tryActivate(licenseKey, instanceId);
		}

		// if the license is still not valid, prompt the user to enter a license
        if (!isLicenseValid) {
            const action = await vscode.window.showInformationMessage(
                LICENSE_MESSAGES.REQUIRE_LICENSE,
                LICENSE_MESSAGES.ACTIONS.ENTER_LICENSE,
                LICENSE_MESSAGES.ACTIONS.PURCHASE_LICENSE
            );

            if (action === LICENSE_MESSAGES.ACTIONS.ENTER_LICENSE) {
                return this.promptForLicense();
            } else if (action === LICENSE_MESSAGES.ACTIONS.PURCHASE_LICENSE) {
                vscode.env.openExternal(vscode.Uri.parse(this.storeUrl));
                return false;
            }
            return false;
        }

		return true;
    }

    private async promptForLicense(): Promise<boolean> {
        const license = await vscode.window.showInputBox({
            prompt: LICENSE_MESSAGES.LICENSE_PROMPT,
            placeHolder: LICENSE_MESSAGES.LICENSE_PLACEHOLDER,
            ignoreFocusOut: true
        });

        if (!license) {
            return false;
        }

        try {
            const instanceId = getInstanceId(this.context);
            
            // try to validate the license
            const isValid = await this.validate(license, instanceId);
            
            // try to activate the license
            const isActivated = await this.tryActivate(license, instanceId);

			// if neither the license is valid nor activated, show error message
			if (!isValid && !isActivated) {
				const action = await vscode.window.showErrorMessage(
					LICENSE_MESSAGES.INVALID_LICENSE,
					LICENSE_MESSAGES.ACTIONS.TRY_AGAIN,
					LICENSE_MESSAGES.ACTIONS.CONTACT_SUPPORT
				);

				if (action === LICENSE_MESSAGES.ACTIONS.TRY_AGAIN) {
					return this.promptForLicense();
				} else if (action === LICENSE_MESSAGES.ACTIONS.CONTACT_SUPPORT) {
					vscode.env.openExternal(vscode.Uri.parse('mailto:support@getmode.dev'));
				}
				return false;
			}

			// if the license is valid, store it
			const licenseIdPair = `${license}:${instanceId}`;
			await this.context.globalState.update(LicenseManager.LICENSE_KEY_ID_PAIR, licenseIdPair);
			return true;
        } catch (error) {
            vscode.window.showErrorMessage(LICENSE_MESSAGES.FAILED_VALIDATION);
            return false;
        }
    }

    private async tryActivate(licenseKey: string, instanceId: string): Promise<boolean> {
        try {
            const response = await fetch(this.activationUrl, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    license_key: licenseKey,
                    instance_name: instanceId
                })
            });

            const data = await response.json();
            return data.activated === true;
        } catch (error) {
            return false;
        }
    }

    private async validate(licenseKey: string, instanceId: string): Promise<boolean> {
        try {
            const response = await fetch(this.validationUrl, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    license_key: licenseKey,
                    instance_id: instanceId
                })
            });

            const data = await response.json();
            return data.valid === true;
        } catch (error) {
            return false;
        }
    }

    public async deactivateLicense(): Promise<boolean> {
        const licenseIdPair = this.context.globalState.get<string>(LicenseManager.LICENSE_KEY_ID_PAIR);
        if (!licenseIdPair) {
            return true; // Already deactivated
        }

        const [licenseKey, instanceId] = licenseIdPair.split(':');
        
        try {
            const response = await fetch(this.deactivationUrl, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    license_key: licenseKey,
                    instance_id: instanceId
                })
            });

            const data = await response.json();
            if (data.deactivated === true) {
                // Clear the stored license
                await this.context.globalState.update(LicenseManager.LICENSE_KEY_ID_PAIR, undefined);
                return true;
            }
            return false;
        } catch (error) {
            vscode.window.showErrorMessage(LICENSE_MESSAGES.FAILED_DEACTIVATION);
            return false;
        }
    }
}

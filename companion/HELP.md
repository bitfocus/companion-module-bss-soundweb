# BSS Soundweb Control for Companion v3

This module allows Companion to control BSS Soundweb London devices using the Direct Inject message protocol (over IP).  To date, it has been tested on:
* Soundweb BLU-806DA
* Soundweb BLU-160

In theory, it should work on all other Soundweb devices, providing they support the [London Direct Inject Protocol](https://help.harmanpro.com/soundweb-london-third-party-control).

This module is only compatible with Companion v3 and will be maintained from Companion `v3.2.0` onwards.

## Setting up a connection
You only need to provide the IP address of a single device (node) within your Soundweb deployment/design.  This device can behave as a 'gateway' for Companion to communicate with all the other devices within your design.

You may choose to setup Companion with multiple Soundweb connections for availability reasons (because you don't want a single point of failure) or because you want Companion to communicate with devices from different designs.  There should be no problem with doing this providing each connection uses a different gateway node.

## Parameter Addresses

Because Soundweb devices are based on an open architecture, users of this module must provide the HiQNet addresses of the objects and/or parameters they wish to control.

A HiQNet address is formed from 4 parts:

##### 1. Node Address
This is the device (node) address on which the object you wish to control is located (such as a gain control, EQ, Compressor etc).  It is a 2-byte value with a usable range of 1 - 65,536 (decimal).

##### 2. Virtual Device (VD) Address
Each device/node is segregated into separate logical 'sub devices'.  For example, and in the case of a Soundweb BLU806, these are:
* 0: Device manager
* 2: Logic
* 3: Audio

In this example, this means audio objects are accessed under the VD `3` and logic objects would be accessed under the VD `2`.

The Virtual Device address is represented as a 1-byte value, so has a value between 0-255 (decimal).

##### 3. Object ID
An object within the context of Soundweb devices is usually a processing object that can be placed into a design.  In the case of audio processing objects, this can be something like a gain, EQ, compressor, gate, mixer etc.

The object ID is formed from three 'octets' (8-bit/1-byte values) e.g. `1.2.3`.  As you place objects into a design, the third octet value is automatically incremented by one so every object in the design has a unique ID.

##### 4. Parameter ID (State variable ID)
The parameter ID (or state variable ID if you are referencing older London Architect documentation) is the specific control parameter within an object that you wish to control.  For example, a 'Gain N-Input' object has a number of gain controls and mutes (one of each for each channel).  Each gain and mute control has its own parameter ID.  This ID is represented by a 16-bit (2-byte) value.

NB: Parameter IDs are identical between objects of the same type.  For example, a mute control for Ch3 of a 'Gain N-Input' will always have the same parameter ID for all 'Gain N-Input' objects within a design.

### Where to find the parameter/object addresses in Audio/London Architect
##### Audio Architect
There are a few ways to find addresses within Audio Architect:
* Venue Explorer: When in offline/edit mode, you can browse the venue tree right down to the parameter IDs of all the objects in a design.
* Object Properties pane: You can find the address of a selected object in the properties pane (at the bottom) under the field 'HiQnet Address'.
* Panel Editing: When editing a custom panel, when you select a control, you can find the Parameter address under the 'Parameters' tab and clicking on 'Addresses'.

##### London Architect
Use the 'London Direct Inject message tool', which can be found in the 'Direct Inject toolbar' and looks like a mini audio DI box.

Further details about this can be found in this document on Page 14: [Soundweb London Interface Kit](https://bssaudio.com/en/site_elements/soundweb-london-di-kit#:~:text=The%20Direct%20Inject%20message%20This,network%20via%20RS232%20and%20Ethernet.&text=3%2Dwire%20Null%20modem%20cable.&text=Standard%20Soundweb%20London%20Ethernet%20network.)

## Parameter address format
When entering a parameter address for actions and feedbacks, the address must be provided in one of the following 'fully-qualified' formats.

Values may be given in decimal or hexadecimal.  For example, a node address with a value of 999 may be given as either:

Decimal: `999`<br>
Hexadecimal (Hex): `0x03E7`

To make finding and supplying addresses to the module easier, both decimal and hexadecimal values may be used interchangeably for the various fields across the parameter address.  This means you can have a node address represented in hex, but the vd & objects represented in decimal.  All hex values must be prefixed with `0x`.

### Option 1 (Default)
The 'default' representation used throughout the module is represented in decimal across six fields, delimited by `.`.  Users may supply fields in hexadecimal if they prefer.
```
[NODE].[VD].[OBJECT_1].[OBJECT_2].[OBJECT_3].[PARAMETER]
```
Examples of acceptable inputs:
```
999.3.0.1.1.0
0x03e7.0x03.0x00.0x01.0x01.0x00
```
Where:
<br>Node = <b>999</b>
<br>VD = <b>3</b>
<br>Object = <b>0.1.1</b>
<br>Parameter = <b>0</b>

### Option 2
This option may be useful when you can only find an object ID represented as a single hexadecimal or decimal value, rather than as three octets.
```
[NODE].[VD].[OBJECT].[PARAMETER]
```
Examples of acceptable inputs:
```
999.3.0x000101.0
0x03e7.0x03.0x000101.0
999.3.257.0  # Probably unlikely to represent an object as a single decimal field/value, but it should work
```
Where:
<br>Node = <b>999</b>
<br>VD = <b>3</b>
<br>Object = <b>0.1.1</b>
<br>Parameter = <b>0</b>

### Option 3
This option is useful in Audio Architect when you select an object and grab its fully-qualified address (Node + VD + Object represented as a single hex value) from the properties pane.  The parameter ID is still supplied separately, delimited by `.`
```
[FULLY_QUALIFIED_OBJECT_ADDRESS].[PARAMETER]
```
Examples of acceptable inputs:
```
0x03e703000101.0
```
Where:
<br>Node = <b>999</b>
<br>VD = <b>3</b>
<br>Object = <b>0.1.1</b>
<br>Parameter = <b>0</b>

## Unsupported Parameters
### Time
The time parameter is used internally by the module as a makeshift watchdog/heartbeat mechanism to let the module know when nodes connect and/or disconnect etc.  If you try to subscribe to the time parameter, it will not work properly.

## Module Variables
### Parameter Values
Parameter Variables show the live/current value/state of a given parameter.  They can be created in different units, so a gain value (for example) may be represented in percent, decibels or as its raw value.

Parameter Variables may be created by ticking the 'Create variable?' option in a feedback or by placing a 'Parameter Variable' feedback on a button.  From there you can set the desired unit within the options (More units will be supported in due course).

## Using Custom Variables in Actions & Feedbacks
For more advanced use cases, you may want to supply a variable to an action or feedback's options.  This is currently supported/tested in the following cases:

### Parameter addresses
You may supply a variable for any field within the parameter address.  This may be useful in a number of circumstances, but one case might be if you have a design with lots of mixer objects, and you just want to switch between the different mixers and for Companion to map one set of controls to the selected mixer.

In this situation, you can configure a custom variable in Companion called `selected_mixer` which can be set with the object addresses for the various mixers.  You can then use it in a parameter address like this:
```
999.3.$(internal:custom_selected_mixer).0
```
### Gain N-Input selected channel
You may want to supply a variable to select the channel of an Gain N-Input object.  For example: `$(internal:custom_selected_channel)`.  This may be entered as a custom value in the dropdown menu.  It must have a value in the range `1-32`.
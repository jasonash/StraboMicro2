<?php
/**
 * File: index.php
 * Description: StraboMicro Viewer Login Helper
 *
 * @package    StraboSpot Web Site
 * @author     Jason Ash <jasonash@ku.edu>
 * @copyright  2025 StraboSpot
 * @license    https://opensource.org/licenses/MIT MIT License
 * @link       https://strabospot.org
 */

include("../prepare_connections.php");

SESSION_START();

$userpkey = $_SESSION['userpkey'];
if($userpkey == "") $userpkey = 999999;

$id = (int)$_GET['p'];

$row = $db->get_row_prepared("select * from micro_projectmetadata where id = $1 and (ispublic or userpkey=$2)", array($id, $userpkey));

if($row->id == ""){
	echo "Error! Project not found.";
	exit();
}

// Refresh the static ./smzFiles/<id>/project.json (which the viewer JS fetches
// client-side) with the strabosamples spine overlay if a Samples-app edit
// dirtied it, before the page's JS reads it. Mirrors straboMicroView/view.php.
// Owner is $row->userpkey (the project owner). No-op when clean or when the
// per-project static dir isn't present.
require_once(__DIR__ . '/../microdb/lib/sample_overlay.php');
micro_regenerate_files_if_dirty($db, (int)$id, (int)$row->userpkey);


include("microviewer.html");
